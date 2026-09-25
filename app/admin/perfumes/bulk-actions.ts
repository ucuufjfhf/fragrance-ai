"use server";

import type { BulkProfileFailedItem } from "@/lib/admin/bulk/service";
import {
  createBulkProfileJob,
  getBulkProfileJobProgress,
  getLatestOpenBulkProfileJob,
  listBulkProfileFailedItems,
  pauseBulkProfileJob,
  retryBulkProfileFailedItems,
  startBulkProfileJob,
} from "@/lib/admin/bulk/service";
import { processBulkProfileChunk } from "@/lib/admin/bulk/processor";
import { resolveBulkMaxItems, isValidStoreId } from "@/lib/admin/bulk/helpers";
import { AI_BULK_MAX_ITEMS } from "@/lib/admin/bulk/contract";
import { requireAdminAction } from "@/lib/admin/server-access";

/**
 * Phase 12.5 — server actions wiring the bulk profiling engine into the admin
 * product list. THIN ADAPTERS ONLY: every lifecycle decision lives in the
 * Phase 12.1–12.4 service/processor (atomic claiming, state machine, fill-only
 * semantics, store isolation); these functions validate untrusted input, call
 * one service primitive, and map the typed reason to Persian feedback.
 *
 * Security invariants (unchanged from the underlying layers):
 *  - every action first performs the admin access gate check
 *    (`requireAdminAction` — unauthenticated callers are redirected to the
 *    gate page, mirroring the former `proxy.ts` network boundary);
 *  - AI runs server-side only; the browser never sees credentials or provider
 *    payloads (the processor defaults to `createAIProvider()` internally);
 *  - every action re-checks ownership through the store-scoped service — a
 *    foreign jobId/itemId/perfumeId is indistinguishable from a missing one;
 *  - the storeId arrives from the admin page (server-resolved store list),
 *    and the service re-validates it anyway.
 */

/** Persian feedback for every bulk action outcome (admin-facing language). */
const BULK_MESSAGES = {
  invalidStore: "فروشگاه نامعتبر است.",
  empty: "حداقل یک عطر را انتخاب کنید.",
  overLimit: "تعداد عطرهای انتخاب‌شده بیشتر از حد مجاز است.",
  invalidIds: "شناسه‌های عطر نامعتبر یا تکراری هستند.",
  foreignPerfume: "برخی عطرها به این فروشگاه تعلق ندارند.",
  notFound: "کار پروفایل‌سازی پیدا نشد.",
  invalidTransition: "این تغییر وضعیت در حال حاضر ممکن نیست.",
  unresolved: "هنوز موارد در حال پردازش وجود دارد؛ کمی بعد دوباره تلاش کنید.",
  dbError: "خطایی در پایگاه داده رخ داد؛ دوباره تلاش کنید.",
} as const;

export type BulkActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

export type BulkJobCreatedResult =
  | { ok: true; jobId: string; totalItems: number }
  | { ok: false; message: string };

/** Serializable progress snapshot for the browser (DB is the source of truth). */
export type BulkProgressSnapshot = {
  jobId: string;
  status: string;
  remaining: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** Live item-derived terminal count, for the percentage display. */
  total: number;
};

/** One failed item for the admin UI (safe message only, never a payload). */
export interface BulkFailedItemView {
  itemId: string;
  perfumeName: string | null;
  errorMessage: string;
}

/**
 * Creates a bulk profiling job from the admin's selection (Phase 12.5).
 *
 * Validation order mirrors the service: store id → id list (empty, shape,
 * duplicates, `AI_BULK_MAX_ITEMS`) → store/ownership enforcement inside
 * `createBulkProfileJob`. No AI request happens here — job creation is pure
 * database work.
 */
export async function createBulkJobAction(
  storeId: string,
  perfumeIds: unknown,
): Promise<BulkJobCreatedResult> {
  await requireAdminAction();

  if (!isValidStoreId(storeId)) {
    return { ok: false, message: BULK_MESSAGES.invalidStore };
  }
  if (!Array.isArray(perfumeIds)) {
    return { ok: false, message: BULK_MESSAGES.empty };
  }
  if (perfumeIds.length === 0) {
    return { ok: false, message: BULK_MESSAGES.empty };
  }

  const maxItems = resolveBulkMaxItems(process.env.AI_BULK_MAX_ITEMS, AI_BULK_MAX_ITEMS);
  if (perfumeIds.length > maxItems) {
    return { ok: false, message: `${BULK_MESSAGES.overLimit} (${maxItems} مورد).` };
  }
  for (const id of perfumeIds) {
    if (typeof id !== "string" || id.trim() === "") {
      return { ok: false, message: BULK_MESSAGES.invalidIds };
    }
  }

  const result = await createBulkProfileJob({
    storeId,
    perfumeIds: perfumeIds as readonly string[],
  });

  if (!result.ok) {
    switch (result.reason) {
      case "INVALID_STORE":
        return { ok: false, message: BULK_MESSAGES.invalidStore };
      case "INVALID_INPUT":
        return { ok: false, message: BULK_MESSAGES.invalidIds };
      case "PERFUME_SELECTION_INVALID":
        return { ok: false, message: BULK_MESSAGES.foreignPerfume };
      default:
        return { ok: false, message: BULK_MESSAGES.dbError };
    }
  }

  return { ok: true, jobId: result.jobId, totalItems: result.totalItems };
}

/**
 * Starts (or resumes after a rate-limit pause) a store-owned job. State
 * legality is the service's contract guard, not this adapter's.
 */
export async function startBulkJobAction(
  jobId: string,
  storeId: string,
): Promise<BulkActionResult> {
  await requireAdminAction();

  const result = await startBulkProfileJob(jobId, storeId);

  if (!result.ok) {
    return { ok: false, message: bulkTransitionMessage(result.reason, BULK_MESSAGES) };
  }
  return { ok: true };
}

/**
 * Manual pause (`RUNNING → PAUSED_RATE_LIMITED`, the service's only pause
 * edge). The UI labels it clearly; the state machine stays untouched.
 */
export async function pauseBulkJobAction(
  jobId: string,
  storeId: string,
): Promise<BulkActionResult> {
  await requireAdminAction();

  const result = await pauseBulkProfileJob(jobId, storeId);

  if (!result.ok) {
    return { ok: false, message: bulkTransitionMessage(result.reason, BULK_MESSAGES) };
  }
  return { ok: true, message: "پروفایل‌سازی متوقف شد." };
}

/**
 * Processes ONE bounded chunk through the existing processor and returns the
 * live progress snapshot. The browser drives chunk-to-chunk progression; this
 * action never loops, and overlapping requests are harmless because item
 * claiming is atomic in the service.
 */
export async function processBulkChunkAction(
  jobId: string,
  storeId: string,
): Promise<
  | {
      ok: true;
      progress: BulkProgressSnapshot;
      /** Unique items this chunk actually started processing (stall signal). */
      processed: number;
      pausedForRateLimit: boolean;
      timeBudgetExhausted: boolean;
    }
  | { ok: false; message: string }
> {
  await requireAdminAction();

  const result = await processBulkProfileChunk({ jobId, storeId });

  if (!result.ok) {
    return {
      ok: false,
      message: result.reason === "NOT_FOUND" ? BULK_MESSAGES.notFound : BULK_MESSAGES.dbError,
    };
  }

  const { chunk } = result;
  return {
    ok: true,
    progress: toSnapshot(jobId, chunkToFields(chunk)),
    processed: chunk.processed,
    pausedForRateLimit: chunk.pausedForRateLimit,
    timeBudgetExhausted: chunk.timeBudgetExhausted,
  };
}

/**
 * Reads the DB-backed progress for a job (no side effects), plus the safe
 * failure views for the failed-items section.
 */
export async function getBulkJobProgressAction(
  jobId: string,
  storeId: string,
): Promise<
  | { ok: true; progress: BulkProgressSnapshot; failedItems: BulkFailedItemView[] }
  | { ok: false; message: string }
> {
  await requireAdminAction();

  const progress = await getBulkProfileJobProgress(jobId, storeId);
  if (!progress.ok) {
    return {
      ok: false,
      message: progress.reason === "NOT_FOUND" ? BULK_MESSAGES.notFound : BULK_MESSAGES.dbError,
    };
  }

  const failed = await listBulkProfileFailedItems(jobId, storeId);
  const failedItems: BulkFailedItemView[] = failed.ok
    ? failed.items.map(toFailedItemView)
    : [];

  return { ok: true, progress: toSnapshot(jobId, progress.progress), failedItems };
}

/** Full client-facing job view: snapshot + safe failed-item rows. */
export interface AdminBulkJobView {
  jobId: string;
  status: string;
  progress: BulkProgressSnapshot | null;
  failedItems: BulkFailedItemView[];
}

/**
 * The store's newest open job (PENDING/RUNNING/PAUSED_RATE_LIMITED) with its
 * live DB progress — lets the admin page restore an in-flight job after a
 * reload and gives the panel a manual "check status" probe. Terminal jobs are
 * history and never returned here.
 */
export async function getOpenBulkJobForStoreAction(
  storeId: string,
): Promise<AdminBulkJobView | null> {
  await requireAdminAction();

  if (!isValidStoreId(storeId)) {
    return null;
  }

  const open = await getLatestOpenBulkProfileJob(storeId);
  if (!open.ok || !open.job) {
    return null;
  }

  const jobId = open.job.jobId;
  const progress = await getBulkProfileJobProgress(jobId, storeId);
  const failed = await listBulkProfileFailedItems(jobId, storeId);

  return {
    jobId,
    status: open.job.status,
    progress: progress.ok ? toSnapshot(jobId, progress.progress) : null,
    failedItems: failed.ok ? failed.items.map(toFailedItemView) : [],
  };
}

/**
 * Retries every failed item of the job (`FAILED → PENDING`, batch, store-
 * scoped) and returns the count. The admin then continues chunk processing.
 */
export async function retryBulkFailedItemsAction(
  jobId: string,
  storeId: string,
): Promise<{ ok: true; retried: number } | { ok: false; message: string }> {
  await requireAdminAction();

  const result = await retryBulkProfileFailedItems(jobId, storeId);

  if (!result.ok) {
    return {
      ok: false,
      message: result.reason === "NOT_FOUND" ? BULK_MESSAGES.notFound : BULK_MESSAGES.dbError,
    };
  }
  return { ok: true, retried: result.retried };
}

/** Maps a job-transition reason to Persian feedback (shared by start/pause). */
function bulkTransitionMessage(
  reason: "NOT_FOUND" | "INVALID_TRANSITION" | "UNRESOLVED_ITEMS" | "DB_ERROR",
  messages: typeof BULK_MESSAGES,
): string {
  switch (reason) {
    case "NOT_FOUND":
      return messages.notFound;
    case "INVALID_TRANSITION":
      return messages.invalidTransition;
    case "UNRESOLVED_ITEMS":
      return messages.unresolved;
    default:
      return messages.dbError;
  }
}

/** The processor's chunk payload fields (kept narrow for the snapshot). */
function chunkToFields(chunk: {
  status: string;
  remaining: number;
  succeeded: number;
  failed: number;
  skipped: number;
}) {
  return chunk;
}

/** Assembles the serializable progress snapshot with the live total. */
function toSnapshot(
  jobId: string,
  fields: {
    status: string;
    remaining: number;
    succeeded: number;
    failed: number;
    skipped: number;
  },
): BulkProgressSnapshot {
  return {
    jobId,
    status: fields.status,
    remaining: fields.remaining,
    succeeded: fields.succeeded,
    failed: fields.failed,
    skipped: fields.skipped,
    // Live item-derived total: terminal + unresolved — never a stale counter.
    total:
      fields.remaining + fields.succeeded + fields.failed + fields.skipped,
  };
}

/** Safe Persian fallback for a missing/unknown stored failure message. */
const UNKNOWN_FAILURE_MESSAGE = "خطای نامشخص.";

function toFailedItemView(item: BulkProfileFailedItem): BulkFailedItemView {
  return {
    itemId: item.itemId,
    perfumeName: item.perfumeName,
    errorMessage:
      item.errorMessage && item.errorMessage.trim() !== ""
        ? item.errorMessage
        : UNKNOWN_FAILURE_MESSAGE,
  };
}
