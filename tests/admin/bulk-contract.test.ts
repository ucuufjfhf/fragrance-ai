import { describe, expect, it } from "vitest";

import {
  AI_BULK_MAX_ITEMS,
  BULK_AI_BACKOFF_MAX_MS,
  BULK_AI_CHUNK_SIZE,
  BULK_AI_CHUNK_TIME_BUDGET_MS,
  BULK_AI_CONCURRENCY,
  BULK_AI_ERROR_CODES,
  BULK_AI_MAX_ATTEMPTS,
  BULK_AI_RETRYABLE_ERROR_CODES,
  BULK_AI_STALE_HEARTBEAT_MS,
  BULK_ITEM_STATUSES,
  BULK_JOB_STATUSES,
  type BulkAiErrorCode,
} from "@/lib/admin/bulk/contract";
import {
  bulkBackoffDelayMs,
  canTransitionItemStatus,
  canTransitionJobStatus,
  findDuplicateIds,
  isBulkAiErrorCode,
  isRetryableBulkError,
  isValidBatchSize,
  isValidStoreId,
  resolveBulkMaxItems,
  validateBulkPerfumeIds,
} from "@/lib/admin/bulk/helpers";

/**
 * Phase 12.1 bulk contract tests — pure, no database, no network, no secrets.
 *
 * Pins the approved architecture: job/item states, centralised MVP limits,
 * the typed failure-code set, the retry policy, deterministic backoff and
 * basic bulk input validation (including state-transition guards).
 */

describe("Phase 12.1 — bulk contract: states", () => {
  it("defines all six job states", () => {
    expect([...BULK_JOB_STATUSES]).toEqual([
      "PENDING",
      "RUNNING",
      "PAUSED_RATE_LIMITED",
      "COMPLETED",
      "COMPLETED_WITH_ERRORS",
      "FAILED",
    ]);
  });

  it("defines all five item states", () => {
    expect([...BULK_ITEM_STATUSES]).toEqual([
      "PENDING",
      "RUNNING",
      "SUCCEEDED",
      "FAILED",
      "SKIPPED",
    ]);
  });
});

describe("Phase 12.1 — bulk contract: limits", () => {
  it("pins the approved MVP limits", () => {
    expect(AI_BULK_MAX_ITEMS).toBe(500);
    expect(BULK_AI_CONCURRENCY).toBe(1);
    expect(BULK_AI_CHUNK_SIZE).toBe(10);
    expect(BULK_AI_MAX_ATTEMPTS).toBe(2);
    expect(BULK_AI_CHUNK_TIME_BUDGET_MS).toBe(120_000);
    expect(BULK_AI_STALE_HEARTBEAT_MS).toBe(120_000);
  });

  it("accepts valid batch sizes (1, 10, 500)", () => {
    expect(isValidBatchSize(1)).toBe(true);
    expect(isValidBatchSize(BULK_AI_CHUNK_SIZE)).toBe(true);
    expect(isValidBatchSize(AI_BULK_MAX_ITEMS)).toBe(true);
  });

  it("rejects zero, negative, over-limit and non-integer batch sizes", () => {
    expect(isValidBatchSize(0)).toBe(false);
    expect(isValidBatchSize(-1)).toBe(false);
    expect(isValidBatchSize(AI_BULK_MAX_ITEMS + 1)).toBe(false);
    expect(isValidBatchSize(2.5)).toBe(false);
    expect(isValidBatchSize("10")).toBe(false);
    expect(isValidBatchSize(Number.NaN)).toBe(false);
  });

  it("validates perfume id lists against the max-item limit", () => {
    const ids = Array.from({ length: AI_BULK_MAX_ITEMS }, (_, i) => `p-${i}`);
    expect(validateBulkPerfumeIds(ids)).toEqual({ ok: true });

    const tooMany = Array.from({ length: AI_BULK_MAX_ITEMS + 1 }, (_, i) => `p-${i}`);
    expect(validateBulkPerfumeIds(tooMany).ok).toBe(false);
  });

  it("rejects an empty id list", () => {
    expect(validateBulkPerfumeIds([]).ok).toBe(false);
    expect(validateBulkPerfumeIds(null).ok).toBe(false);
    expect(validateBulkPerfumeIds("p-1").ok).toBe(false);
  });

  it("resolves the max-items limit from an env string safely", () => {
    expect(resolveBulkMaxItems(undefined)).toBe(AI_BULK_MAX_ITEMS);
    expect(resolveBulkMaxItems(null)).toBe(AI_BULK_MAX_ITEMS);
    expect(resolveBulkMaxItems("")).toBe(AI_BULK_MAX_ITEMS);
    expect(resolveBulkMaxItems("250")).toBe(250);
    expect(resolveBulkMaxItems("abc")).toBe(AI_BULK_MAX_ITEMS);
    expect(resolveBulkMaxItems("0")).toBe(AI_BULK_MAX_ITEMS);
    expect(resolveBulkMaxItems("-3")).toBe(AI_BULK_MAX_ITEMS);
    expect(resolveBulkMaxItems("2.5")).toBe(AI_BULK_MAX_ITEMS);
  });
});

describe("Phase 12.1 — bulk contract: duplicates", () => {
  it("accepts a unique id list", () => {
    expect(findDuplicateIds(["a", "b", "c"])).toEqual([]);
    expect(validateBulkPerfumeIds(["a", "b", "c"])).toEqual({ ok: true });
  });

  it("detects duplicate ids (each reported once, in order)", () => {
    expect(findDuplicateIds(["a", "b", "a", "c", "b", "a"])).toEqual(["a", "b"]);
    expect(validateBulkPerfumeIds(["a", "b", "a"]).ok).toBe(false);
  });

  it("rejects blank id entries", () => {
    expect(validateBulkPerfumeIds(["a", "  "]).ok).toBe(false);
    expect(validateBulkPerfumeIds(["a", 1]).ok).toBe(false);
  });
});
describe("Phase 12.1 — bulk contract: retry policy", () => {
  it("covers exactly the approved failure codes", () => {
    expect([...BULK_AI_ERROR_CODES]).toEqual([
      "unavailable",
      "timeout",
      "http_429",
      "http_5xx",
      "http_other",
      "invalid_output",
    ]);
    expect([...BULK_AI_RETRYABLE_ERROR_CODES]).toEqual(["timeout", "http_429", "http_5xx"]);
  });

  it("marks timeout / 429 / 5xx as retryable", () => {
    expect(isRetryableBulkError("timeout")).toBe(true);
    expect(isRetryableBulkError("http_429")).toBe(true);
    expect(isRetryableBulkError("http_5xx")).toBe(true);
  });

  it("never auto-retries unavailable / http_other / invalid_output", () => {
    expect(isRetryableBulkError("unavailable")).toBe(false);
    expect(isRetryableBulkError("http_other")).toBe(false);
    expect(isRetryableBulkError("invalid_output")).toBe(false);
  });

  it("guards the failure-code type against arbitrary strings", () => {
    expect(isBulkAiErrorCode("timeout")).toBe(true);
    expect(isBulkAiErrorCode("anything_else")).toBe(false);
    expect(isBulkAiErrorCode(429)).toBe(false);
    expect(isBulkAiErrorCode(undefined)).toBe(false);
  });
});

describe("Phase 12.1 — bulk contract: backoff", () => {
  it("attempt 1 waits ~2s, attempt 2 waits ~8s", () => {
    expect(bulkBackoffDelayMs(1)).toBe(2_000);
    expect(bulkBackoffDelayMs(2)).toBe(8_000);
  });

  it("is deterministic and requires no randomness", () => {
    expect(bulkBackoffDelayMs(2)).toBe(bulkBackoffDelayMs(2));
    expect(bulkBackoffDelayMs(1)).toBe(bulkBackoffDelayMs(1));
  });

  it("caps very large attempts and clamps invalid attempt numbers", () => {
    expect(bulkBackoffDelayMs(100)).toBe(BULK_AI_BACKOFF_MAX_MS);
    expect(bulkBackoffDelayMs(0)).toBe(2_000);
    expect(bulkBackoffDelayMs(-5)).toBe(2_000);
    expect(bulkBackoffDelayMs(Number.NaN)).toBe(2_000);
  });

  it("accepts an injected jitter source without global randomness", () => {
    expect(bulkBackoffDelayMs(1, () => 0)).toBe(1_500);
    expect(bulkBackoffDelayMs(1, () => 1)).toBe(2_500);
    expect(bulkBackoffDelayMs(2, () => 0.5)).toBe(bulkBackoffDelayMs(2, () => 0.5));
  });
});

describe("Phase 12.1 — bulk contract: input + transition guards", () => {
  it("validates store ids", () => {
    expect(isValidStoreId("store-1")).toBe(true);
    expect(isValidStoreId("")).toBe(false);
    expect(isValidStoreId("   ")).toBe(false);
    expect(isValidStoreId(123)).toBe(false);
    expect(isValidStoreId(null)).toBe(false);
  });

  it("allows only the approved job transitions", () => {
    expect(canTransitionJobStatus("PENDING", "RUNNING")).toBe(true);
    expect(canTransitionJobStatus("RUNNING", "PAUSED_RATE_LIMITED")).toBe(true);
    expect(canTransitionJobStatus("RUNNING", "COMPLETED_WITH_ERRORS")).toBe(true);
    expect(canTransitionJobStatus("PAUSED_RATE_LIMITED", "RUNNING")).toBe(true);

    expect(canTransitionJobStatus("PENDING", "COMPLETED")).toBe(false);
    expect(canTransitionJobStatus("COMPLETED", "RUNNING")).toBe(false);
    expect(canTransitionJobStatus("FAILED", "PENDING")).toBe(false);
  });

  it("allows only the approved item transitions", () => {
    expect(canTransitionItemStatus("PENDING", "RUNNING")).toBe(true);
    expect(canTransitionItemStatus("RUNNING", "SUCCEEDED")).toBe(true);
    expect(canTransitionItemStatus("RUNNING", "FAILED")).toBe(true);
    // Stale-heartbeat reclaim and manual retry are the only backward edges.
    expect(canTransitionItemStatus("RUNNING", "PENDING")).toBe(true);
    expect(canTransitionItemStatus("FAILED", "PENDING")).toBe(true);

    expect(canTransitionItemStatus("SUCCEEDED", "PENDING")).toBe(false);
    expect(canTransitionItemStatus("SKIPPED", "RUNNING")).toBe(false);
    expect(canTransitionItemStatus("PENDING", "SUCCEEDED")).toBe(false);
  });
});

describe("Phase 12.1 — bulk contract: determinism", () => {
  it("every pure helper returns the same result for the same inputs", () => {
    const ids = ["a", "b", "a"];

    expect(validateBulkPerfumeIds(ids)).toEqual(validateBulkPerfumeIds(ids));
    expect(findDuplicateIds(ids)).toEqual(findDuplicateIds(ids));
    expect(isRetryableBulkError("timeout")).toBe(isRetryableBulkError("timeout"));
    expect(bulkBackoffDelayMs(2)).toBe(bulkBackoffDelayMs(2));
    expect(resolveBulkMaxItems("250")).toBe(resolveBulkMaxItems("250"));
    expect(canTransitionJobStatus("RUNNING", "FAILED")).toBe(
      canTransitionJobStatus("RUNNING", "FAILED"),
    );
  });
});

// Type-level pin: the exported code union stays assignable and exhaustive.
const _allCodes: readonly BulkAiErrorCode[] = BULK_AI_ERROR_CODES;
void _allCodes;

