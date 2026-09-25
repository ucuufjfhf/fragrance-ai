import { getPrisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  AI_BULK_MAX_ITEMS,
  BULK_AI_STALE_HEARTBEAT_MS,
  type BulkAiErrorCode,
  type BulkJobStatus,
} from "@/lib/admin/bulk/contract";
import {
  canTransitionJobStatus,
  isBulkAiErrorCode,
  isValidStoreId,
  resolveBulkMaxItems,
  validateBulkPerfumeIds,
  type BulkProfileWrite,
} from "@/lib/admin/bulk/helpers";
import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";

/**
 * Phase 12.3 — database-backed bulk AI profiling service.
 *
 * Server-only: no React, no UI, no server actions, no `fetch`, no Qwen/AI. This
 * module owns job/item lifecycle and is independently testable before the later
 * processing loop (12.4) wires in the provider.
 *
 * Two non-negotiable invariants drive every function here:
 *
 *  1. ATOMIC CLAIMING — multiple workers can never claim the same item. Every
 *     state change is a *conditional* `updateMany` (`WHERE id = ? AND status = ?`)
 *     and success is decided by the affected-row count, never by a
 *     read-then-write race. Losing a race is normal control flow, not an error.
 *
 *  2. STORE ISOLATION — every operation re-checks the tenant boundary through
 *     `job.storeId` (direct column for jobs, `job: { storeId }` for items).
 *     A foreign id and a nonexistent id return the *same* `NOT_FOUND` reason, so
 *     cross-store existence never leaks.
 *
 * Job counters are incremented atomically (`{ increment: 1 }`) inside the same
 * transaction that flips an item to a terminal state — and only by the single
 * caller whose conditional item update affected exactly one row — so a racing
 * duplicate transition can never double-count. AI HTTP calls must NEVER be
 * placed inside a transaction (preserved for 12.4).
 *
 * Phase 12.4 additions (still server-only, still no AI/fetch here):
 *  - `releaseBulkProfileItemForRetry` — the dedicated `RUNNING → PENDING`
 *    automatic-retry release (attempts deliberately untouched; the next claim
 *    increments);
 *  - `reclaimStaleBulkProfileItems` — batch stale-heartbeat self-heal for one
 *    job (single conditional statement, idempotent under concurrency);
 *  - `getBulkProfileJobProgress` — serializable status + pending count probes;
 *  - `persistBulkProfileItemSuccess` — applies the fill-only profile write
 *    ATOMICALLY with the `SUCCEEDED` flip and the exactly-once counter inside
 *    the winning transaction. Pure DB work only — never an HTTP call.
 */

/** Bounded re-selection loop when another worker wins the claim race. */
const CLAIM_MAX_ATTEMPTS = 5;

/** Truncation cap for a stored, key-safe failure message (never provider payloads). */
const FAILURE_MESSAGE_MAX = 500;

const DB_ERROR_DETAIL = "خطایی در پایگاه داده رخ داد.";

/** A single item successfully claimed for processing. */
export interface ClaimedBulkItem {
  itemId: string;
  jobId: string;
  perfumeId: string;
  attempts: number;
  rowNumber: number | null;
}

export type BulkJobCreateResult =
  | { ok: true; jobId: string; totalItems: number }
  | {
      ok: false;
      reason: "INVALID_STORE" | "INVALID_INPUT" | "PERFUME_SELECTION_INVALID" | "DB_ERROR";
      detail?: string;
    };

export type BulkClaimResult =
  | { ok: true; item: ClaimedBulkItem }
  | { ok: false; reason: "NOT_FOUND" | "JOB_NOT_ACTIVE" | "NOT_CLAIMABLE" | "DB_ERROR"; detail?: string };

export type BulkHeartbeatResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "NOT_RUNNING" | "DB_ERROR"; detail?: string };

export type BulkReclaimResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "NOT_RUNNING" | "NOT_STALE" | "DB_ERROR"; detail?: string };

/** The three terminal item states reachable from `RUNNING`. */
export type BulkItemTerminalStatus = "SUCCEEDED" | "FAILED" | "SKIPPED";

export type BulkItemTerminalResult =
  | { ok: true; status: BulkItemTerminalStatus }
  | {
      ok: false;
      reason: "NOT_FOUND" | "NOT_RUNNING" | "INVALID_INPUT" | "DB_ERROR";
      detail?: string;
    };

export type BulkItemRetryResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "NOT_FAILED" | "DB_ERROR"; detail?: string };

export type BulkJobTransitionResult =
  | { ok: true; status: BulkJobStatus }
  | {
      ok: false;
      reason: "NOT_FOUND" | "UNRESOLVED_ITEMS" | "INVALID_TRANSITION" | "DB_ERROR";
      detail?: string;
    };

/**
 * Creates a `BulkProfileJob` plus one `PENDING` `BulkProfileItem` per accepted
 * perfume, atomically — if any item cannot be created the job rolls back too.
 *
 * Validation order: store id → id-list shape (empty/duplicate/max via the Phase
 * 12.1 helper) → store exists → every perfume belongs to this store. A missing
 * perfume and a foreign-store perfume both fail the single scoped `findMany`
 * probe with the identical `PERFUME_SELECTION_INVALID` reason (no existence leak).
 *
 * Note (documented decision): there is no project rule requiring active-only
 * profiling, so inactive-but-owned perfumes are accepted; only ownership is
 * enforced here.
 */
export async function createBulkProfileJob(
  input: CreateBulkProfileJobInput,
): Promise<BulkJobCreateResult> {
  const { storeId, perfumeIds, rowNumbers } = input;

  if (!isValidStoreId(storeId)) {
    return { ok: false, reason: "INVALID_STORE" };
  }

  const maxItems = resolveBulkMaxItems(process.env.AI_BULK_MAX_ITEMS, AI_BULK_MAX_ITEMS);
  const idsValidation = validateBulkPerfumeIds(perfumeIds, maxItems);
  if (!idsValidation.ok) {
    return { ok: false, reason: "INVALID_INPUT", detail: idsValidation.reason };
  }

  // Safe narrowing: the helper above guarantees a non-empty list of unique strings.
  const ids = perfumeIds as readonly string[];
  const prisma = getPrisma();

  try {
    const store = await prisma.store.findFirst({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) {
      return { ok: false, reason: "INVALID_STORE" };
    }

    const owned = await prisma.perfume.findMany({
      where: { id: { in: [...ids] }, storeId },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      return { ok: false, reason: "PERFUME_SELECTION_INVALID" };
    }

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.bulkProfileJob.create({
        data: {
          storeId,
          status: "PENDING",
          totalItems: ids.length,
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
        },
        select: { id: true },
      });

      for (const perfumeId of ids) {
        await tx.bulkProfileItem.create({
          data: {
            jobId: created.id,
            perfumeId,
            status: "PENDING",
            attempts: 0,
            rowNumber: toRowNumber(rowNumbers?.[perfumeId]),
          },
        });
      }

      return created;
    });

    return { ok: true, jobId: job.id, totalItems: ids.length };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/**
 * Atomically claims the next `PENDING` item of a `RUNNING` job.
 *
 * Selection and claim are separate on purpose (the sanctioned pattern): pick a
 * candidate, then a conditional `updateMany` with `WHERE status = PENDING`
 * decides the winner by affected-row count. If another worker got there first
 * the count is 0 and we simply re-select a new candidate (bounded loop) — never
 * a read-then-write race. A successful claim flips `PENDING → RUNNING`,
 * increments `attempts`, and sets `heartbeatAt`, touching nothing else (not the
 * perfume, profile, axes, or job counters).
 *
 * A foreign job and a missing job both return `NOT_FOUND`; a non-`RUNNING` job
 * returns `JOB_NOT_ACTIVE`; an exhausted/absent candidate returns `NOT_CLAIMABLE`.
 */
export async function claimNextBulkProfileItem(
  jobId: string,
  storeId: string,
): Promise<BulkClaimResult> {
  const prisma = getPrisma();

  try {
    const job = await prisma.bulkProfileJob.findFirst({
      where: { id: jobId, storeId },
      select: { id: true, status: true },
    });
    if (!job) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    if (job.status !== "RUNNING") {
      return { ok: false, reason: "JOB_NOT_ACTIVE" };
    }

    for (let attempt = 0; attempt < CLAIM_MAX_ATTEMPTS; attempt += 1) {
      const candidate = await prisma.bulkProfileItem.findFirst({
        where: { jobId, status: "PENDING" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (!candidate) {
        return { ok: false, reason: "NOT_CLAIMABLE" };
      }

      const claimed = await prisma.bulkProfileItem.updateMany({
        where: { id: candidate.id, jobId, status: "PENDING" },
        data: { status: "RUNNING", attempts: { increment: 1 }, heartbeatAt: new Date() },
      });

      if (claimed.count === 1) {
        const fresh = await prisma.bulkProfileItem.findFirst({
          where: { id: candidate.id, jobId },
          select: { id: true, jobId: true, perfumeId: true, attempts: true, rowNumber: true },
        });
        if (!fresh) {
          return { ok: false, reason: "NOT_CLAIMABLE" };
        }
        return {
          ok: true,
          item: {
            itemId: fresh.id,
            jobId: fresh.jobId,
            perfumeId: fresh.perfumeId,
            attempts: fresh.attempts,
            rowNumber: fresh.rowNumber,
          },
        };
      }
      // Lost the race — another worker claimed it first; loop to re-select.
    }

    return { ok: false, reason: "NOT_CLAIMABLE" };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/** 1-based CSV row numbers keyed by perfume id; non-positive/invalid → null. */
function toRowNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/** Truncated, key-safe failure message; empty/absent → null. */
function truncateMessage(message: string | undefined): string | null {
  if (typeof message !== "string") {
    return null;
  }
  const trimmed = message.trim();
  return trimmed === "" ? null : trimmed.slice(0, FAILURE_MESSAGE_MAX);
}

export interface CreateBulkProfileJobInput {
  storeId: string;
  perfumeIds: readonly string[];
  /** Optional CSV row numbers keyed by perfume id (import integration later). */
  rowNumbers?: Readonly<Record<string, number>>;
}

/**
 * Refreshes a `RUNNING` item's heartbeat (progress keep-alive).
 *
 * The conditional `updateMany` enforces store isolation (`job: { storeId }`),
 * state (`status = RUNNING`), and the write in one atomic operation — it changes
 * only `heartbeatAt`, never status, attempts, or counters. A missing/foreign
 * item returns `NOT_FOUND` (identical, no leak); a non-`RUNNING` item — or one
 * that lost a race right after the read — returns `NOT_RUNNING`.
 */
export async function touchBulkProfileItemHeartbeat(
  itemId: string,
  storeId: string,
): Promise<BulkHeartbeatResult> {
  const prisma = getPrisma();

  try {
    const item = await prisma.bulkProfileItem.findFirst({
      where: { id: itemId, job: { storeId } },
      select: { id: true, status: true },
    });
    if (!item) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    if (item.status !== "RUNNING") {
      return { ok: false, reason: "NOT_RUNNING" };
    }

    const updated = await prisma.bulkProfileItem.updateMany({
      where: { id: itemId, status: "RUNNING", job: { storeId } },
      data: { heartbeatAt: new Date() },
    });
    if (updated.count === 1) {
      return { ok: true };
    }
    return { ok: false, reason: "NOT_RUNNING" };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/**
 * Reclaims an abandoned claim: `RUNNING → PENDING` when the heartbeat is stale
 * (`null` or older than `BULK_AI_STALE_HEARTBEAT_MS`, e.g. after a server
 * restart).
 *
 * The conditional `updateMany` requires `status = RUNNING` **and** a stale
 * heartbeat in the same atomic operation, so a fresh item or a concurrent
 * reclaimer that got there first yields a count of 0 (`NOT_STALE`). The data
 * sets only `status` and `heartbeatAt: null` — `attempts` is deliberately NOT
 * incremented or otherwise touched, preserving the current attempt count.
 */
export async function reclaimStaleBulkProfileItem(
  itemId: string,
  storeId: string,
): Promise<BulkReclaimResult> {
  const prisma = getPrisma();

  try {
    const item = await prisma.bulkProfileItem.findFirst({
      where: { id: itemId, job: { storeId } },
      select: { id: true, status: true },
    });
    if (!item) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    if (item.status !== "RUNNING") {
      return { ok: false, reason: "NOT_RUNNING" };
    }

    const cutoff = new Date(Date.now() - BULK_AI_STALE_HEARTBEAT_MS);
    const reclaimed = await prisma.bulkProfileItem.updateMany({
      where: {
        id: itemId,
        status: "RUNNING",
        job: { storeId },
        OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: cutoff } }],
      },
      data: { status: "PENDING", heartbeatAt: null },
    });
    if (reclaimed.count === 1) {
      return { ok: true };
    }
    return { ok: false, reason: "NOT_STALE" };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/** Untrusted failure payload; `code` is validated against `BULK_AI_ERROR_CODES`. */
export interface BulkItemFailure {
  code: string;
  message?: string;
}

const INVALID_FAILURE_DETAIL = "کد خطای نامعتبر است.";

type TerminalOutcome =
  | { ok: true; status: BulkItemTerminalStatus }
  | { ok: false; reason: "NOT_FOUND" | "NOT_RUNNING" };

/**
 * Shared terminal transition: `RUNNING → SUCCEEDED | FAILED | SKIPPED`.
 *
 * Runs in ONE transaction: a conditional `updateMany` flips the item (store-
 * scoped, `WHERE status = RUNNING`) and — only if it affected exactly one row —
 * atomically increments the matching job counter (`{ increment: 1 }`). Because
 * the counter bump is gated on winning the conditional update, a racing
 * duplicate transition can never increment twice. The data clears `heartbeatAt`
 * (and any stale error fields); it never touches attempts, perfume, profile or
 * axes. Returns `NOT_RUNNING` when the item was already transitioned by a peer.
 *
 * `work` (Phase 12.4): optional pure-DB callback executed inside the winning
 * transaction, BETWEEN the item flip and the counter bump — used by
 * `persistBulkProfileItemSuccess` to apply the fill-only profile write
 * atomically with the flip. If it throws, the whole transaction rolls back
 * (the item stays RUNNING, no success is claimed, no count is bumped).
 * It must NEVER contain an HTTP/AI call.
 */
async function transitionItemToTerminal(
  itemId: string,
  storeId: string,
  terminal: BulkItemTerminalStatus,
  failure?: BulkItemFailure,
  work?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<BulkItemTerminalResult> {
  let failureCode: BulkAiErrorCode | null = null;

  if (terminal === "FAILED") {
    if (!failure || !isBulkAiErrorCode(failure.code)) {
      return { ok: false, reason: "INVALID_INPUT", detail: INVALID_FAILURE_DETAIL };
    }
    failureCode = failure.code;
  }

  const prisma = getPrisma();

  try {
    const outcome: TerminalOutcome = await prisma.$transaction(
      async (tx): Promise<TerminalOutcome> => {
        const item = await tx.bulkProfileItem.findFirst({
          where: { id: itemId, job: { storeId } },
          select: { id: true, jobId: true, status: true },
        });
        if (!item) {
          return { ok: false, reason: "NOT_FOUND" };
        }
        if (item.status !== "RUNNING") {
          return { ok: false, reason: "NOT_RUNNING" };
        }

        const updated = await tx.bulkProfileItem.updateMany({
          where: { id: itemId, status: "RUNNING", job: { storeId } },
          data: {
            status: terminal,
            heartbeatAt: null,
            errorCode: failureCode,
            errorMessage: terminal === "FAILED" && failure ? truncateMessage(failure.message) : null,
          },
        });
        if (updated.count !== 1) {
          return { ok: false, reason: "NOT_RUNNING" };
        }

        if (work) {
          await work(tx);
        }

        const counterUpdate =
          terminal === "SUCCEEDED"
            ? { successCount: { increment: 1 } }
            : terminal === "FAILED"
              ? { failedCount: { increment: 1 } }
              : { skippedCount: { increment: 1 } };

        await tx.bulkProfileJob.updateMany({
          where: { id: item.jobId, storeId },
          data: counterUpdate,
        });

        return { ok: true, status: terminal };
      },
    );

    if (outcome.ok) {
      return { ok: true, status: outcome.status };
    }
    return { ok: false, reason: outcome.reason };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/** `RUNNING → SUCCEEDED`; increments `successCount`. */
export function markBulkProfileItemSucceeded(
  itemId: string,
  storeId: string,
): Promise<BulkItemTerminalResult> {
  return transitionItemToTerminal(itemId, storeId, "SUCCEEDED");
}

/** `RUNNING → FAILED`; records the typed error and increments `failedCount`. */
export function markBulkProfileItemFailed(
  itemId: string,
  storeId: string,
  failure: BulkItemFailure,
): Promise<BulkItemTerminalResult> {
  return transitionItemToTerminal(itemId, storeId, "FAILED", failure);
}

/** `RUNNING → SKIPPED`; increments `skippedCount`. */
export function markBulkProfileItemSkipped(
  itemId: string,
  storeId: string,
): Promise<BulkItemTerminalResult> {
  return transitionItemToTerminal(itemId, storeId, "SKIPPED");
}

/**
 * Prepares a `FAILED` item for another attempt: `FAILED → PENDING`.
 *
 * Clears `errorCode`, `errorMessage` and `heartbeatAt`, but does NOT increment
 * `attempts` (the next claim will) and does NOT touch job totals. Conditional
 * and store-scoped: only a currently-`FAILED` item reverts; any other state
 * returns `NOT_FAILED`, and a foreign/nonexistent item returns `NOT_FOUND`.
 */
export async function retryBulkProfileItem(
  itemId: string,
  storeId: string,
): Promise<BulkItemRetryResult> {
  const prisma = getPrisma();

  try {
    const item = await prisma.bulkProfileItem.findFirst({
      where: { id: itemId, job: { storeId } },
      select: { id: true, status: true },
    });
    if (!item) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    if (item.status !== "FAILED") {
      return { ok: false, reason: "NOT_FAILED" };
    }

    const updated = await prisma.bulkProfileItem.updateMany({
      where: { id: itemId, status: "FAILED", job: { storeId } },
      data: { status: "PENDING", errorCode: null, errorMessage: null, heartbeatAt: null },
    });
    if (updated.count === 1) {
      return { ok: true };
    }
    return { ok: false, reason: "NOT_FAILED" };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/**
 * Generic single-job state transition (`start`/`pause`/`fail`).
 *
 * Order: store-scoped read (foreign + missing both → `NOT_FOUND`, no leak) →
 * contract guard via `canTransitionJobStatus` (Phase 12.1 map; never bypassed)
 * → conditional `updateMany` pinned to the status we just read, so a concurrent
 * change yields a count of 0 (`INVALID_TRANSITION`) instead of an illegal jump.
 *
 * Timestamps are derived from the transition itself: first start (`PENDING →
 * RUNNING`) stamps `startedAt`; a resume (`PAUSED → RUNNING`) preserves it; any
 * terminal outcome (`COMPLETED`/`COMPLETED_WITH_ERRORS`/`FAILED`) stamps
 * `completedAt`.
 */
async function transitionJob(
  jobId: string,
  storeId: string,
  target: BulkJobStatus,
): Promise<BulkJobTransitionResult> {
  const prisma = getPrisma();

  try {
    const job = await prisma.bulkProfileJob.findFirst({
      where: { id: jobId, storeId },
      select: { id: true, status: true },
    });
    if (!job) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    if (!canTransitionJobStatus(job.status, target)) {
      return { ok: false, reason: "INVALID_TRANSITION", detail: `${job.status} → ${target}` };
    }

    const data: { status: BulkJobStatus; startedAt?: Date; completedAt?: Date } = { status: target };
    if (target === "RUNNING" && job.status === "PENDING") {
      data.startedAt = new Date();
    }
    if (target === "COMPLETED" || target === "COMPLETED_WITH_ERRORS" || target === "FAILED") {
      data.completedAt = new Date();
    }

    const updated = await prisma.bulkProfileJob.updateMany({
      where: { id: jobId, storeId, status: job.status },
      data,
    });
    if (updated.count === 1) {
      return { ok: true, status: target };
    }
    return { ok: false, reason: "INVALID_TRANSITION" };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/** `PENDING → RUNNING` (first start, stamps `startedAt`) or `PAUSED → RUNNING` (resume). */
export function startBulkProfileJob(jobId: string, storeId: string): Promise<BulkJobTransitionResult> {
  return transitionJob(jobId, storeId, "RUNNING");
}

/** `RUNNING → PAUSED_RATE_LIMITED` (rate-limit hold). */
export function pauseBulkProfileJob(jobId: string, storeId: string): Promise<BulkJobTransitionResult> {
  return transitionJob(jobId, storeId, "PAUSED_RATE_LIMITED");
}

/** `RUNNING | PAUSED → FAILED` (abandon; contract forbids `PENDING → FAILED`). */
export function failBulkProfileJob(jobId: string, storeId: string): Promise<BulkJobTransitionResult> {
  return transitionJob(jobId, storeId, "FAILED");
}

type CompleteOutcome =
  | { ok: true; status: BulkJobStatus }
  | { ok: false; reason: "NOT_FOUND" | "UNRESOLVED_ITEMS" | "INVALID_TRANSITION" };

/**
 * Completes a job, deriving the outcome from live item state — never from the
 * (potentially stale) counters.
 *
 * Runs in ONE transaction: store-scoped read → `groupBy` over items → decide →
 * conditional status flip. Semantics:
 *  - any item still `PENDING` or `RUNNING` → `UNRESOLVED_ITEMS` (nothing written);
 *  - at least one `FAILED` (and none unresolved) → `COMPLETED_WITH_ERRORS`;
 *  - all `SUCCEEDED`/`SKIPPED` (no `FAILED`) → `COMPLETED`.
 *
 * `SKIPPED` is a deliberate exclusion, not a failure, so skipped-without-failed
 * completes as `COMPLETED`. The `PENDING → RUNNING → COMPLETED*` path is gated
 * by the Phase 12.1 contract (`canTransitionJobStatus`); a concurrent change
 * between read and write yields a count of 0 → `INVALID_TRANSITION`.
 */
export async function completeBulkProfileJob(
  jobId: string,
  storeId: string,
): Promise<BulkJobTransitionResult> {
  const prisma = getPrisma();

  try {
    const outcome: CompleteOutcome = await prisma.$transaction(
      async (tx): Promise<CompleteOutcome> => {
        const job = await tx.bulkProfileJob.findFirst({
          where: { id: jobId, storeId },
          select: { id: true, status: true },
        });
        if (!job) {
          return { ok: false, reason: "NOT_FOUND" };
        }

        const counts = await tx.bulkProfileItem.groupBy({
          by: ["status"],
          where: { jobId },
          _count: { _all: true },
        });

        let pending = 0;
        let running = 0;
        let failed = 0;
        for (const row of counts) {
          const n = row._count._all;
          if (row.status === "PENDING") {
            pending = n;
          } else if (row.status === "RUNNING") {
            running = n;
          } else if (row.status === "FAILED") {
            failed = n;
          }
        }

        if (pending > 0 || running > 0) {
          return { ok: false, reason: "UNRESOLVED_ITEMS" };
        }

        const target: BulkJobStatus = failed > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
        if (!canTransitionJobStatus(job.status, target)) {
          return { ok: false, reason: "INVALID_TRANSITION" };
        }

        const updated = await tx.bulkProfileJob.updateMany({
          where: { id: jobId, storeId, status: job.status },
          data: { status: target, completedAt: new Date() },
        });
        if (updated.count !== 1) {
          return { ok: false, reason: "INVALID_TRANSITION" };
        }
        return { ok: true, status: target };
      },
    );

    if (outcome.ok) {
      return { ok: true, status: outcome.status };
    }
    return { ok: false, reason: outcome.reason };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/* --------------------------------------------------------------------------- */
/* Phase 12.4 — automatic-retry release, batch self-heal, progress, success     */
/* --------------------------------------------------------------------------- */

/**
 * The dedicated automatic-retry release: `RUNNING → PENDING` (Phase 12.4).
 *
 * Deliberately NOT `markBulkProfileItemFailed` + `retryBulkProfileItem` (that
 * would wrongly bump `failedCount` and wrongly clear the attempt record) and
 * NOT a manual-retry abuse: this is the explicit `RUNNING → PENDING` edge of
 * the contract, used when a transient AI error should be retried automatically.
 *
 * The conditional `updateMany` requires `status = RUNNING` and the store
 * boundary in one atomic op, so a peer that already moved the item yields a
 * count of 0. It clears `heartbeatAt` and any error fields but deliberately
 * does NOT touch `attempts` — the next claim increments it, so the database
 * value keeps counting real processing starts.
 */
export async function releaseBulkProfileItemForRetry(
  itemId: string,
  storeId: string,
): Promise<BulkItemRetryResult> {
  const prisma = getPrisma();

  try {
    const updated = await prisma.bulkProfileItem.updateMany({
      where: { id: itemId, status: "RUNNING", job: { storeId } },
      data: { status: "PENDING", heartbeatAt: null, errorCode: null, errorMessage: null },
    });
    if (updated.count === 1) {
      return { ok: true };
    }

    // Bounded re-selection to distinguish a missing/foreign item from one a
    // peer already moved — degraded to the existing degraded reasons, no leak.
    const item = await prisma.bulkProfileItem.findFirst({
      where: { id: itemId, job: { storeId } },
      select: { id: true, status: true },
    });
    if (!item) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    return { ok: false, reason: "NOT_FAILED" };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/**
 * Batch stale-heartbeat self-heal for one job: reclaims every abandoned
 * claim (`RUNNING → PENDING`) whose heartbeat is `null` or older than
 * `BULK_AI_STALE_HEARTBEAT_MS` (e.g. after a server restart or a closed
 * browser).
 *
 * ONE conditional statement for the whole job — idempotent and concurrency-
 * safe: a second caller matches nothing. Store isolation rides on the
 * caller-scoped job probe. Like the per-item reclaim, it never touches
 * `attempts` (reclaiming is recovery, not processing).
 */
export async function reclaimStaleBulkProfileItems(
  jobId: string,
  storeId: string,
): Promise<
  | { ok: true; reclaimed: number }
  | { ok: false; reason: "NOT_FOUND" | "DB_ERROR"; detail?: string }
> {
  const prisma = getPrisma();

  try {
    const job = await prisma.bulkProfileJob.findFirst({
      where: { id: jobId, storeId },
      select: { id: true },
    });
    if (!job) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    const cutoff = new Date(Date.now() - BULK_AI_STALE_HEARTBEAT_MS);
    const result = await prisma.bulkProfileItem.updateMany({
      where: {
        jobId,
        status: "RUNNING",
        OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: cutoff } }],
      },
      data: { status: "PENDING", heartbeatAt: null },
    });

    return { ok: true, reclaimed: result.count };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/** Serializable known-state snapshot for a job (safe across API boundaries). */
export interface BulkProfileJobProgress {
  jobId: string;
  status: BulkJobStatus;
  /** Items still waiting to be claimed (`PENDING`). */
  remaining: number;
  /** Live item-derived terminal counts (not the potentially stale counters). */
  succeeded: number;
  failed: number;
  skipped: number;
}

/**
 * Reads the serializable known-state snapshot (Phase 12.4): known status plus
 * live item-derived counts. Used by the processor before/after a chunk to
 * return honest progress without trusting the potentially stale counters.
 */
export async function getBulkProfileJobProgress(
  jobId: string,
  storeId: string,
): Promise<
  | { ok: true; progress: BulkProfileJobProgress }
  | { ok: false; reason: "NOT_FOUND" | "DB_ERROR"; detail?: string }
> {
  const prisma = getPrisma();

  try {
    const job = await prisma.bulkProfileJob.findFirst({
      where: { id: jobId, storeId },
      select: { id: true, status: true },
    });
    if (!job) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    const counts = await prisma.bulkProfileItem.groupBy({
      by: ["status"],
      where: { jobId },
      _count: { _all: true },
    });

    const progress: BulkProfileJobProgress = {
      jobId: job.id,
      status: job.status,
      remaining: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };

    for (const row of counts) {
      const n = row._count._all;
      if (row.status === "PENDING") {
        progress.remaining = n;
      } else if (row.status === "SUCCEEDED") {
        progress.succeeded = n;
      } else if (row.status === "FAILED") {
        progress.failed = n;
      } else if (row.status === "SKIPPED") {
        progress.skipped = n;
      }
    }

    return { ok: true, progress };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/**
 * Applies a fill-only profile write ATOMICALLY with the item success (Phase 12.4).
 *
 * ONE transaction (winning the `RUNNING → SUCCEEDED` edge): profile
 * create/update + item flip + exactly-once `successCount` — all-or-nothing.
 * The write is PLAIN DATA computed by the pure `computeBulkProfileWrite`
 * helper; this function contains only DB work, never an HTTP/AI call.
 *
 * Fill-only semantics applied here, keyed on the unique `perfumeId`:
 *  - update: writes ONLY the eligible fields from the write (fillable
 *    descriptors, fillable `family`/`notes`) — non-zero stored values are
 *    structurally absent from the write, so they cannot be overwritten; the
 *    nine protected matching axes are never in the write;
 *  - create: a brand-new profile with the eligible AI fields and documented
 *    schema-consistent defaults for everything else — the nine required axes
 *    are stamped 0 (schema-consistent default; bulk profiling never invents
 *    matching values), `notes` defaults to [].
 *
 * A racing peer (or a rolled-back write) yields `NOT_RUNNING` / `DB_ERROR`:
 * no success is claimed, no count is bumped, and the item stays recoverable.
 */
export async function persistBulkProfileItemSuccess(
  itemId: string,
  storeId: string,
  write: BulkProfileWrite,
  perfumeId: string,
): Promise<BulkItemTerminalResult> {
  const updateData: Record<string, unknown> = {};

  for (const [dimension, value] of Object.entries(write.descriptors)) {
    updateData[dimension] = value;
  }
  if (write.family !== undefined) {
    updateData.family = write.family;
  }
  if (write.notes !== undefined) {
    updateData.notes = write.notes;
  }

  const createData: Record<string, unknown> = { perfumeId };

  // The required axes are stamped 0: a schema-consistent default, never an
  // invented matching value. Admins can refine them later through the normal
  // form; AI structurally cannot write them here.
  for (const axis of MATCHING_DIMENSIONS) {
    createData[axis] = 0;
  }
  for (const [dimension, value] of Object.entries(write.descriptors)) {
    createData[dimension] = value;
  }
  if (write.family !== undefined) {
    createData.family = write.family;
  }
  createData.notes = write.notes ?? [];

  const work = async (tx: Prisma.TransactionClient): Promise<void> => {
    await tx.fragranceProfile.upsert({
      where: { perfumeId },
      // The plain-data shapes above mirror the schema column-for-column; the
      // cast documents that contract in one place (plain data in, schema out).
      create: createData as unknown as Prisma.FragranceProfileUncheckedCreateInput,
      update: updateData,
    });
  };

  return transitionItemToTerminal(itemId, storeId, "SUCCEEDED", undefined, work);
}

/* --------------------------------------------------------------------------- */
/* Phase 12.5 — read/batch support for the admin integration (no lifecycle edges) */
/* --------------------------------------------------------------------------- */

/** One failed item as shown in the admin UI (safe, truncated message only). */
export interface BulkProfileFailedItem {
  itemId: string;
  perfumeId: string;
  perfumeName: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Read-only view of a job's `FAILED` items with the perfume display name —
 * the data source for the admin "failed items" section (Phase 12.5).
 *
 * Read-only, store-scoped (`job: { storeId }`), and bounded: like every other
 * function here it is a single scoped statement, never a lifecycle mutation.
 * Only the typed error code and the stored key-safe message are exposed —
 * never a provider payload.
 */
export async function listBulkProfileFailedItems(
  jobId: string,
  storeId: string,
): Promise<
  | { ok: true; items: BulkProfileFailedItem[] }
  | { ok: false; reason: "NOT_FOUND" | "DB_ERROR"; detail?: string }
> {
  const prisma = getPrisma();

  try {
    const job = await prisma.bulkProfileJob.findFirst({
      where: { id: jobId, storeId },
      select: { id: true },
    });
    if (!job) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    const failed = await prisma.bulkProfileItem.findMany({
      where: { jobId, status: "FAILED" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        perfumeId: true,
        errorCode: true,
        errorMessage: true,
        perfume: { select: { name: true } },
      },
    });

    return {
      ok: true,
      items: failed.map((item) => ({
        itemId: item.id,
        perfumeId: item.perfumeId,
        perfumeName: item.perfume?.name ?? null,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
      })),
    };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/**
 * Batch "retry failed" for the admin UI (Phase 12.5): reverts EVERY currently-
 * `FAILED` item of the job back to `PENDING` in ONE conditional, store-scoped
 * statement — the same fields the per-item `retryBulkProfileItem` clears
 * (`errorCode`, `errorMessage`, `heartbeatAt`), never `attempts` (the next
 * claim increments it) and never job counters. Idempotent under concurrency:
 * a second caller matches nothing. A foreign/missing job returns `NOT_FOUND`.
 */
export async function retryBulkProfileFailedItems(
  jobId: string,
  storeId: string,
): Promise<
  | { ok: true; retried: number }
  | { ok: false; reason: "NOT_FOUND" | "DB_ERROR"; detail?: string }
> {
  const prisma = getPrisma();

  try {
    const job = await prisma.bulkProfileJob.findFirst({
      where: { id: jobId, storeId },
      select: { id: true },
    });
    if (!job) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    const result = await prisma.bulkProfileItem.updateMany({
      where: { jobId, status: "FAILED", job: { storeId } },
      data: { status: "PENDING", errorCode: null, errorMessage: null, heartbeatAt: null },
    });

    return { ok: true, retried: result.count };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}

/**
 * The store's newest non-terminal job (`PENDING` / `RUNNING` /
 * `PAUSED_RATE_LIMITED`), or `null` — used by the admin page to restore an
 * in-flight job after a page reload (Phase 12.5). Terminal jobs are history
 * and never block a new one. One store-scoped statement.
 */
export async function getLatestOpenBulkProfileJob(
  storeId: string,
): Promise<
  | { ok: true; job: { jobId: string; status: BulkJobStatus } | null }
  | { ok: false; reason: "DB_ERROR"; detail?: string }
> {
  const prisma = getPrisma();

  try {
    const job = await prisma.bulkProfileJob.findFirst({
      where: {
        storeId,
        status: { in: ["PENDING", "RUNNING", "PAUSED_RATE_LIMITED"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });

    return {
      ok: true,
      job: job ? { jobId: job.id, status: job.status } : null,
    };
  } catch {
    return { ok: false, reason: "DB_ERROR", detail: DB_ERROR_DETAIL };
  }
}
