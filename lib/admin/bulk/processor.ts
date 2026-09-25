import { getPrisma } from "@/lib/db";
import { createAIProvider, type AIProvider, type AiPerfumeProfileResult } from "@/lib/ai/provider";
import { AiUnavailableError, AiRequestError } from "@/lib/ai/errors";
import { validateAiProfileResult } from "@/lib/ai/perfume-profile";
import {
  BULK_AI_CHUNK_SIZE,
  BULK_AI_MAX_ATTEMPTS,
  BULK_AI_CHUNK_TIME_BUDGET_MS,
  BULK_AI_RATE_LIMIT_PAUSE_THRESHOLD,
  type BulkAiErrorCode,
  type BulkJobStatus,
} from "@/lib/admin/bulk/contract";
import {
  computeBulkProfileWrite,
  isRetryableBulkError,
  bulkBackoffDelayMs,
  type BulkProfileWrite,
  type ExistingProfileFacts,
  type DescriptorDimension,
} from "@/lib/admin/bulk/helpers";
import {
  claimNextBulkProfileItem,
  completeBulkProfileJob,
  getBulkProfileJobProgress,
  markBulkProfileItemFailed,
  markBulkProfileItemSkipped,
  pauseBulkProfileJob,
  persistBulkProfileItemSuccess,
  reclaimStaleBulkProfileItems,
  releaseBulkProfileItemForRetry,
  startBulkProfileJob,
  type ClaimedBulkItem,
} from "@/lib/admin/bulk/service";
import {
  DESCRIPTOR_DIMENSIONS,
  MATCHING_DIMENSIONS,
  clampProfileValue,
} from "@/lib/fragrance/profile";
import type { PersonalityVector } from "@/types/personality";

/**
 * Phase 12.4 — the bulk AI execution loop.
 *
 * ORCHESTRATION ONLY: every database state change goes through the genuine
 * `service.ts` primitives (atomic claim / reclaim / terminal / retry /
 * exactly-once counters), every AI call goes through the genuine `AIProvider`
 * abstraction, and every decision uses the Phase 12.1 contract. Nothing here
 * duplicates a lifecycle edge.
 *
 * Non-negotiable invariants (mirrors of the service contract):
 *  - CONCURRENCY 1 — one claimed item at a time; no `Promise.all` for AI work;
 *  - NO AI INSIDE A TRANSACTION — the AI HTTP request runs BETWEEN the atomic
 *    claim and the small per-item persist transaction, never inside one;
 *  - DB STATE IS THE SOURCE OF TRUTH — a chunk processes at most
 *    `BULK_AI_CHUNK_SIZE` items and returns; the browser may close and a later
 *    chunk invocation resumes from the database (no server-side loop, no
 *    external queue/worker/Redis);
 *  - ALWAYS SAFE STATE — a claimed item is always driven to a terminal state
 *    or released back to `PENDING` before the chunk returns; it is never left
 *    orphaned `RUNNING` merely because the chunk ended.
 *
 * Injected seams (`provider`, `sleep`, `now`, `jitter`) keep the loop fully
 * deterministic under test — no real network, no real waiting, no real clock.
 */

/**
 * Fixed, bounded, payload-free diagnostics per failure code (shown to admins).
 * Deliberately NOT the provider's error text: stored messages must never be
 * able to carry keys, headers, request bodies or full provider responses.
 */
const SAFE_FAILURE_MESSAGES: Record<BulkAiErrorCode, string> = {
  unavailable: "هوش مصنوعی در دسترس نیست.",
  timeout: "درخواست هوش مصنوعی بیش از حد طول کشید.",
  http_429: "هوش مصنوعی محدودیت نرخ را اعمال کرد.",
  http_5xx: "سرویس هوش مصنوعی موقتاً در دسترس نیست.",
  http_other: "درخواست هوش مصنوعی با خطا مواجه شد.",
  invalid_output: "خروجی هوش مصنوعی نامعتبر بود.",
};

/** Structured classification of one AI failure — properties, never messages. */
interface AiFailure {
  code: BulkAiErrorCode;
  retryAfterMs: number | null;
}

/**
 * Classifies a thrown AI error from STRUCTURED metadata only (Phase 12.4):
 * `AiRequestError.timeout` / `.status` / `.retryAfterMs` properties, never
 * `error.message` string matching. An unknown error degrades to the
 * non-retryable `invalid_output` class — the least harmful label for an
 * interaction whose shape cannot be trusted.
 */
function classifyAiFailure(error: unknown): AiFailure {
  if (error instanceof AiUnavailableError) {
    return { code: "unavailable", retryAfterMs: null };
  }
  if (error instanceof AiRequestError) {
    if (error.timeout) {
      return { code: "timeout", retryAfterMs: null };
    }
    if (error.status === 429) {
      return { code: "http_429", retryAfterMs: error.retryAfterMs };
    }
    if (error.status !== null && error.status >= 500) {
      return { code: "http_5xx", retryAfterMs: null };
    }
    return { code: "http_other", retryAfterMs: null };
  }
  return { code: "invalid_output", retryAfterMs: null };
}

/** Serializable, per-chunk progress snapshot (safe for a server action later). */
export interface BulkProcessChunkProgress {
  jobId: string;
  storeId: string;
  status: BulkJobStatus;
  /** Unique items this chunk started processing. */
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** Items still waiting to be claimed (live item-derived). */
  remaining: number;
  pausedForRateLimit: boolean;
  timeBudgetExhausted: boolean;
}

export type BulkProcessChunkResult =
  | { ok: true; chunk: BulkProcessChunkProgress }
  | { ok: false; reason: "NOT_FOUND" | "DB_ERROR"; detail?: string };

export interface BulkProcessChunkInput {
  jobId: string;
  storeId: string;
  /** Defaults to the genuine `createAIProvider()`; inject for tests. */
  provider?: AIProvider;
  /** Defaults to a real timeout sleep; inject a fake for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Defaults to `Date.now`; inject for deterministic time-budget tests. */
  now?: () => number;
  /** Optional jitter passthrough for the existing backoff helper. */
  jitter?: () => number;
}

/** Minimal scoped perfume facts the enrichment input needs. */
interface ScopedPerfumeFacts {
  id: string;
  name: string;
  brand: string;
  description: string | null;
}

/** Minimal scoped stored-profile shape (descriptor columns + family/notes). */
type ScopedStoredProfile = Record<DescriptorDimension, number | null> & {
  family: string | null;
  notes: string[];
} & Partial<Record<(typeof MATCHING_DIMENSIONS)[number], number | null>>;

/** Builds the genuine Phase 4 enrichment input from scoped probes only. */
function toAiInput(
  perfume: ScopedPerfumeFacts,
  stored: ScopedStoredProfile | null,
): Parameters<AIProvider["generatePerfumeProfile"]>[0] {
  const matchingProfile = Object.fromEntries(
    MATCHING_DIMENSIONS.map((axis) => [axis, stored ? clampProfileValue(stored[axis] ?? 0) : 0]),
  ) as PersonalityVector;

  const descriptors = stored
    ? (Object.fromEntries(
        DESCRIPTOR_DIMENSIONS.map((dimension) => [dimension, stored[dimension] ?? null]),
      ) as Partial<Record<DescriptorDimension, number | null>>)
    : undefined;

  return {
    perfumeId: perfume.id,
    name: perfume.name,
    brand: perfume.brand,
    description: perfume.description,
    family: stored?.family ?? null,
    notes: stored?.notes ?? [],
    matchingProfile,
    descriptors,
  };
}

/** Stored-profile facts for the fill-only merge (`null` row = nothing stored). */
function toExistingFacts(stored: ScopedStoredProfile | null): ExistingProfileFacts {
  if (!stored) {
    return { descriptors: {}, family: null, notes: null };
  }
  return {
    descriptors: Object.fromEntries(
      DESCRIPTOR_DIMENSIONS.map((dimension) => [dimension, stored[dimension] ?? null]),
    ) as Partial<Record<DescriptorDimension, number | null>>,
    family: stored.family,
    notes: stored.notes,
  };
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Internal per-item result consumed by the chunk loop. */
type ItemOutcome =
  | { kind: "done"; done: "succeeded" | "failed" | "skipped" }
  | { kind: "pending"; releasedItemId?: string }
  | { kind: "pause"; exhaustedItemFailed?: boolean }
  | { kind: "stop"; timeBudgetExhausted?: boolean };

/** Execution context shared by the chunk loop and the per-item loop. */
interface ItemContext {
  jobId: string;
  storeId: string;
  provider: AIProvider;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  jitter?: () => number;
  deadline: number;
  /** Rate-limit hold reached (caller-owned consecutive 429 counter). */
  isRateLimitHold: () => boolean;
  onTransient429: () => void;
  onOtherAiResult: (failure: AiFailure) => void;
  markItemStarted: (itemId: string) => boolean;
}

/**
 * Runs the AI execution for ONE claimed item, including its bounded automatic
 * retries (release → wait → re-claim, so `attempts` counts real starts).
 *
 * Guarantees:
 *  - the AI request NEVER runs inside a database transaction (claim and persist
 *    are separate small DB operations);
 *  - the item is ALWAYS returned to a safe state: terminal, or released to
 *    `PENDING` (recoverable) — never orphaned `RUNNING`;
 *  - a foreign/missing perfume is SKIPPED without leaking cross-store existence;
 *  - only the contract-whitelisted transient classes are retried, at most
 *    `BULK_AI_MAX_ATTEMPTS` total starts, with the existing backoff helper (or
 *    an honored `Retry-After` hint that still fits the chunk budget).
 */
async function executeClaimedItem(
  initial: ClaimedBulkItem,
  context: ItemContext,
): Promise<ItemOutcome> {
  const { provider, sleep, now, deadline, storeId, jobId, jitter } = context;
  let claim = initial;

  for (;;) {
    // --- scoped probes: small single statements, mirroring service isolation.
    const prisma = getPrisma();
    const perfume = await prisma.perfume.findFirst({
      where: { id: claim.perfumeId, storeId },
      select: { id: true, name: true, brand: true, description: true },
    });
    if (!perfume) {
      // Missing or foreign perfume (deleted / tenant drifted since creation):
      // a deliberate exclusion, not a failure — and cross-store existence
      // never leaks because the predicate is identical for both.
      const result = await markBulkProfileItemSkipped(claim.itemId, storeId);
      if (result.ok) {
        return { kind: "done", done: "skipped" };
      }
      // Best-effort recovery if the skip flip lost a race: never leave `RUNNING`.
      await releaseBulkProfileItemForRetry(claim.itemId, storeId);
      return { kind: "pending", releasedItemId: claim.itemId };
    }

    const stored = (await prisma.fragranceProfile.findFirst({
      where: { perfumeId: claim.perfumeId, perfume: { storeId } },
    })) as ScopedStoredProfile | null;

    // --- THE AI CALL: outside any transaction, through the genuine abstraction.
    const aiInput = toAiInput(perfume, stored);
    let failure: AiFailure | null = null;
    let value: AiPerfumeProfileResult | null = null;

    try {
      const raw = await provider.generatePerfumeProfile(aiInput);
      // Authoritative re-validation (same defence-in-depth pattern as
      // `enrichPerfumeProfile`): a compliant provider passes unchanged, and a
      // forgetful one still cannot emit a matching axis or an unknown key.
      value = validateAiProfileResult(
        { descriptors: raw.descriptors, family: raw.family, notes: raw.notes },
        aiInput,
      );
    } catch (error) {
      failure = classifyAiFailure(error);
    }

    // --- success boundary: fill-only write, atomic with the SUCCEEDED flip.
    if (!failure && value) {
      const write: BulkProfileWrite = computeBulkProfileWrite(toExistingFacts(stored), value);
      const persisted = await persistBulkProfileItemSuccess(claim.itemId, storeId, write, claim.perfumeId);
      if (persisted.ok) {
        return { kind: "done", done: "succeeded" };
      }
      // The persist write lost a race or rolled back: no success is claimed,
      // the item stays recoverable — release it to the FIFO and move on.
      await releaseBulkProfileItemForRetry(claim.itemId, storeId);
      return { kind: "pending", releasedItemId: claim.itemId };
    }

    // --- failure boundary.
    const aiFailure = failure as AiFailure;

    if (aiFailure.code === "http_429") {
      context.onTransient429();
    } else {
      context.onOtherAiResult(aiFailure);
    }

    // Rate-limit hold: respect the item boundary first (release within the
    // retry window, terminal outside it), then the loop pauses the job.
    if (aiFailure.code === "http_429" && context.isRateLimitHold()) {
      if (claim.attempts < BULK_AI_MAX_ATTEMPTS) {
        await releaseBulkProfileItemForRetry(claim.itemId, storeId);
        return { kind: "pause" };
      }
      await markBulkProfileItemFailed(claim.itemId, storeId, {
        code: "http_429",
        message: SAFE_FAILURE_MESSAGES.http_429,
      });
      // Exhausted item held terminal — the chunk counts it as a FAILED item.
      return { kind: "pause", exhaustedItemFailed: true };
    }

    const transientBoundary =
      claim.attempts < BULK_AI_MAX_ATTEMPTS && isRetryableBulkError(aiFailure.code);

    if (!transientBoundary) {
      const flip = await markBulkProfileItemFailed(claim.itemId, storeId, {
        code: aiFailure.code,
        message: SAFE_FAILURE_MESSAGES[aiFailure.code],
      });
      if (flip.ok) {
        return { kind: "done", done: "failed" };
      }
      await releaseBulkProfileItemForRetry(claim.itemId, storeId);
      return { kind: "pending", releasedItemId: claim.itemId };
    }

    // Transient boundary: release first (never leave `RUNNING`), then wait.
    await releaseBulkProfileItemForRetry(claim.itemId, storeId);

    const delay =
      aiFailure.code === "http_429" && aiFailure.retryAfterMs !== null
        ? aiFailure.retryAfterMs
        : bulkBackoffDelayMs(claim.attempts, jitter);

    if (now() + delay >= deadline) {
      // Honoring the hint (or the backoff) would violate the chunk budget:
      // leave the item `PENDING` (recoverable) and hand control back.
      return { kind: "stop", timeBudgetExhausted: true };
    }
    await sleep(delay);

    // Re-claim through the genuine atomic primitive — `attempts` increments on
    // the real start, so the database keeps counting processing starts.
    const next = await claimNextBulkProfileItem(jobId, storeId);
    if (!next.ok) {
      return { kind: "pending", releasedItemId: claim.itemId };
    }
    claim = next.item;
    if (!context.markItemStarted(claim.itemId)) {
      // Chunk cap reached by a FIFO-different item: release it untouched.
      await releaseBulkProfileItemForRetry(claim.itemId, storeId);
      return { kind: "pending", releasedItemId: claim.itemId };
    }
  }
}

/**
 * Processes one chunk of at most `BULK_AI_CHUNK_SIZE` items sequentially.
 *
 * Flow: probe → resume/start → stale self-heal → sequential claim→AI→persist
 * loop → attempt honest completion → progress snapshot. Every state change
 * goes through the service primitives; every decision uses the contract. The
 * chunk returns control afterwards — the database is the source of truth, and
 * a later invocation resumes from it.
 */
export async function processBulkProfileChunk(
  input: BulkProcessChunkInput,
): Promise<BulkProcessChunkResult> {
  const { jobId, storeId } = input;
  const provider = input.provider ?? createAIProvider();
  const sleep = input.sleep ?? defaultSleep;
  const now = input.now ?? Date.now;
  const deadline = now() + BULK_AI_CHUNK_TIME_BUDGET_MS;

  // --- probe: known status + live counts.
  const probe = await getBulkProfileJobProgress(jobId, storeId);
  if (!probe.ok) {
    return { ok: false, reason: probe.reason, detail: probe.detail };
  }

  let status = probe.progress.status;

  if (status === "COMPLETED" || status === "COMPLETED_WITH_ERRORS" || status === "FAILED") {
    return ready({ ...probe.progress, storeId, processed: 0 }, { pausedForRateLimit: false, timeBudgetExhausted: false });
  }

  if (status === "PENDING" || status === "PAUSED_RATE_LIMITED") {
    // First start (stamps startedAt) or agreed resume after a rate-limit hold.
    const started = await startBulkProfileJob(jobId, storeId);
    if (!started.ok) {
      if (started.reason === "NOT_FOUND") {
        return { ok: false, reason: "NOT_FOUND" };
      }
      // A concurrent chunk already terminated/started the job — report
      // honestly from the database instead of racing it.
      const reprobe = await getBulkProfileJobProgress(jobId, storeId);
      if (!reprobe.ok) {
        return { ok: false, reason: reprobe.reason, detail: reprobe.detail };
      }
      return ready({ ...reprobe.progress, storeId, processed: 0 }, { pausedForRateLimit: false, timeBudgetExhausted: false });
    }
    status = "RUNNING";
  }

  // --- self-heal: reclaim abandoned claims from a dead worker/closed browser.
  await reclaimStaleBulkProfileItems(jobId, storeId);

  const seen = new Set<string>();
  const tracked = { succeeded: 0, failed: 0, skipped: 0 };
  let processed = 0;
  let consecutive429 = 0;
  let pausedForRateLimit = false;
  let timeBudgetExhausted = false;
  let stop = false;
  let lastReleasedItemId: string | undefined;
  let sameItemReleaseStreak = 0;

  while (processed < BULK_AI_CHUNK_SIZE && !stop) {
    if (now() >= deadline) {
      timeBudgetExhausted = true;
      break;
    }

    const claimed = await claimNextBulkProfileItem(jobId, storeId);
    if (!claimed.ok) {
      if (claimed.reason === "NOT_CLAIMABLE") {
        // No `PENDING` item right now — heal once more in case an orphan
        // appeared mid-chunk, then accept exhaustion.
        const healed = await reclaimStaleBulkProfileItems(jobId, storeId);
        if (healed.ok && healed.reclaimed > 0) {
          continue;
        }
        break;
      }
      break;
    }
    const item = claimed.item;
    if (!seen.has(item.itemId)) {
      seen.add(item.itemId);
      processed += 1;
    }

    const outcome = await executeClaimedItem(item, {
      jobId,
      storeId,
      provider,
      sleep,
      now,
      jitter: input.jitter,
      deadline,
      isRateLimitHold: () => consecutive429 >= BULK_AI_RATE_LIMIT_PAUSE_THRESHOLD,
      onTransient429: () => {
        consecutive429 += 1;
      },
      onOtherAiResult: () => {
        consecutive429 = 0;
      },
      markItemStarted: (itemId) => {
        if (seen.has(itemId)) {
          return true; // retry of an already-started item — cap unaffected.
        }
        if (processed >= BULK_AI_CHUNK_SIZE) {
          return false; // FIFO-different item at the cap — caller releases it.
        }
        seen.add(itemId);
        processed += 1;
        return true;
      },
    });

    switch (outcome.kind) {
      case "done":
        tracked[outcome.done] += 1;
        consecutive429 = 0;
        break;
      case "pause":
        if (outcome.exhaustedItemFailed) {
          tracked.failed += 1;
        }
        pausedForRateLimit = true;
        stop = true;
        break;
      case "stop":
        if (outcome.timeBudgetExhausted) {
          timeBudgetExhausted = true;
        }
        stop = true;
        break;
      case "pending":
        // Loop guard: a write that persistently fails is released and instantly
        // re-claimed FIFO (releasing never bumps `attempts`), which could loop
        // in-process forever. If the SAME item is released twice with no other
        // item processed in between, end the chunk — the item stays `PENDING`
        // (recoverable), nothing false is claimed, and the next chunk/worker
        // picks up from the database.
        if (outcome.releasedItemId !== undefined && outcome.releasedItemId === lastReleasedItemId) {
          sameItemReleaseStreak += 1;
          if (sameItemReleaseStreak >= 2) {
            stop = true;
          }
        } else {
          sameItemReleaseStreak = 1;
        }
        lastReleasedItemId = outcome.releasedItemId ?? lastReleasedItemId;
        break;
    }
  }

  if (pausedForRateLimit) {
    await pauseBulkProfileJob(jobId, storeId);
    status = "PAUSED_RATE_LIMITED";
  } else {
    // Attempt honest, item-derived completion; `UNRESOLVED_ITEMS` / gate
    // refusals are normal in-progress outcomes and are intentionally ignored.
    await completeBulkProfileJob(jobId, storeId);
  }

  const snapshot = await getBulkProfileJobProgress(jobId, storeId);
  if (!snapshot.ok) {
    return { ok: false, reason: snapshot.reason, detail: snapshot.detail };
  }

  return ready(
    {
      ...snapshot.progress,
      storeId,
      processed,
      succeeded: tracked.succeeded,
      failed: tracked.failed,
      skipped: tracked.skipped,
    },
    { pausedForRateLimit, timeBudgetExhausted },
  );
}

/** Assembles the ready-result payload (keeps the return sites declarative). */
function ready(
  progress: {
    jobId: string;
    storeId: string;
    status: BulkJobStatus;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    remaining: number;
  },
  flags: { pausedForRateLimit: boolean; timeBudgetExhausted: boolean },
): { ok: true; chunk: BulkProcessChunkProgress } {
  return {
    ok: true,
    chunk: { ...progress, ...flags },
  };
}
