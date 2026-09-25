/**
 * The canonical bulk AI profiling contract (Phase 12).
 *
 * Pure, dependency-free leaf module: no Prisma, no Qwen, no fetch, no Next.js,
 * no React — safe to unit test without a database, network or secrets.
 *
 * This module is the single source of truth for job/item states, limits and
 * failure codes used by the later bulk service, server actions and admin UI.
 * Change values here, nowhere else.
 */

/** All job states (approved Phase 12 architecture). */
export const BULK_JOB_STATUSES = [
  "PENDING",
  "RUNNING",
  "PAUSED_RATE_LIMITED",
  "COMPLETED",
  "COMPLETED_WITH_ERRORS",
  "FAILED",
] as const;

export type BulkJobStatus = (typeof BULK_JOB_STATUSES)[number];

/** All per-item states (approved Phase 12 architecture). */
export const BULK_ITEM_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
] as const;

export type BulkItemStatus = (typeof BULK_ITEM_STATUSES)[number];

/** Terminal job states: no outgoing transitions, nothing left to process. */
export const BULK_JOB_TERMINAL_STATUSES: readonly BulkJobStatus[] = [
  "COMPLETED",
  "COMPLETED_WITH_ERRORS",
  "FAILED",
];

/** Terminal item states: the worker never touches these items again. */
export const BULK_ITEM_TERMINAL_STATUSES: readonly BulkItemStatus[] = ["SUCCEEDED", "SKIPPED"];

/**
 * Allowed job state transitions (data, not logic — the guard lives in
 * `helpers.ts`). Key invariants:
 *  - a paused job can only be resumed (RUNNING) or abandoned (FAILED);
 *  - terminal states have no outgoing transitions.
 */
export const BULK_JOB_TRANSITIONS: Readonly<Record<BulkJobStatus, readonly BulkJobStatus[]>> = {
  PENDING: ["RUNNING"],
  RUNNING: ["PAUSED_RATE_LIMITED", "COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED"],
  PAUSED_RATE_LIMITED: ["RUNNING", "FAILED"],
  COMPLETED: [],
  COMPLETED_WITH_ERRORS: [],
  FAILED: [],
};

/**
 * Allowed item state transitions. Key invariants:
 *  - RUNNING → PENDING is the stale-heartbeat reclaim after a server restart;
 *  - FAILED → PENDING is the explicit manual "retry failed" path;
 *  - SUCCEEDED / SKIPPED are terminal.
 */
export const BULK_ITEM_TRANSITIONS: Readonly<Record<BulkItemStatus, readonly BulkItemStatus[]>> = {
  PENDING: ["RUNNING", "SKIPPED"],
  RUNNING: ["SUCCEEDED", "FAILED", "SKIPPED", "PENDING"],
  FAILED: ["PENDING"],
  SUCCEEDED: [],
  SKIPPED: [],
};

/** Centralised MVP limits (approved Phase 12 architecture). */
export const AI_BULK_MAX_ITEMS = 500;
export const BULK_AI_CONCURRENCY = 1;
export const BULK_AI_CHUNK_SIZE = 10;
export const BULK_AI_MAX_ATTEMPTS = 2;
export const BULK_AI_CHUNK_TIME_BUDGET_MS = 120_000;
export const BULK_AI_STALE_HEARTBEAT_MS = 120_000;

/**
 * Pause the job after this many CONSECUTIVE 429 responses (agreed MVP policy).
 * "Consecutive" is derived while a chunk executes: any AI success or non-429
 * failure resets the counter; a resumed chunk starts from zero (no persistent
 * schema column — agreed for MVP).
 */
export const BULK_AI_RATE_LIMIT_PAUSE_THRESHOLD = 2;

/** Deterministic backoff parameters (see `bulkBackoffDelayMs` in helpers). */
export const BULK_AI_BACKOFF_BASE_MS = 2_000;
export const BULK_AI_BACKOFF_FACTOR = 4;
export const BULK_AI_BACKOFF_MAX_MS = 60_000;

/** The typed set of bulk AI failure codes — extensible here, never ad-hoc strings. */
export const BULK_AI_ERROR_CODES = [
  "unavailable",
  "timeout",
  "http_429",
  "http_5xx",
  "http_other",
  "invalid_output",
] as const;

export type BulkAiErrorCode = (typeof BULK_AI_ERROR_CODES)[number];

/** The only codes eligible for automatic retry (approved retry policy). */
export const BULK_AI_RETRYABLE_ERROR_CODES: readonly BulkAiErrorCode[] = [
  "timeout",
  "http_429",
  "http_5xx",
];
