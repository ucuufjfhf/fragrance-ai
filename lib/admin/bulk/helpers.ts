import {
  AI_BULK_MAX_ITEMS,
  BULK_AI_BACKOFF_BASE_MS,
  BULK_AI_BACKOFF_FACTOR,
  BULK_AI_BACKOFF_MAX_MS,
  BULK_AI_ERROR_CODES,
  BULK_AI_RETRYABLE_ERROR_CODES,
  BULK_ITEM_TRANSITIONS,
  BULK_JOB_TRANSITIONS,
  type BulkAiErrorCode,
  type BulkItemStatus,
  type BulkJobStatus,
} from "@/lib/admin/bulk/contract";
import { DESCRIPTOR_DIMENSIONS } from "@/lib/fragrance/profile";

/**
 * Pure helpers for the Phase 12 bulk AI profiling layer.
 *
 * Everything here is deterministic, database-independent, network-independent
 * and provider-independent: no sleeping, no I/O, no global randomness. The
 * later bulk service owns execution; these functions only make decisions.
 */

export type BulkValidationResult = { ok: true } | { ok: false; reason: string };

const OK: BulkValidationResult = { ok: true };

/** Type guard for the typed failure-code set (keeps arbitrary strings out). */
export function isBulkAiErrorCode(value: unknown): value is BulkAiErrorCode {
  return typeof value === "string" && (BULK_AI_ERROR_CODES as readonly string[]).includes(value);
}

/** Automatic retry is allowed only for transient codes (contract whitelist). */
export function isRetryableBulkError(code: BulkAiErrorCode): boolean {
  return (BULK_AI_RETRYABLE_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Deterministic exponential backoff for a 1-based attempt number:
 * attempt 1 → 2 000 ms, attempt 2 → 8 000 ms, …, capped at 60 s.
 *
 * No randomness by default. If jitter is wanted later, inject it as a function
 * returning a value in [0, 1); the delay is then scaled by 0.75–1.25. Passing
 * the same jitter value always yields the same delay (test-friendly).
 */
export function bulkBackoffDelayMs(attempt: number, jitter?: () => number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;

  const base = Math.min(
    BULK_AI_BACKOFF_BASE_MS * BULK_AI_BACKOFF_FACTOR ** (safeAttempt - 1),
    BULK_AI_BACKOFF_MAX_MS,
  );

  if (jitter === undefined) {
    return base;
  }

  const sample = jitter();
  const clamped = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0;

  return Math.round(base * (0.75 + clamped * 0.5));
}

/** A usable store id is a non-empty, non-whitespace string. */
export function isValidStoreId(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** A valid batch size is an integer within 1..AI_BULK_MAX_ITEMS. */
export function isValidBatchSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= AI_BULK_MAX_ITEMS
  );
}

/**
 * Resolves the max-items limit from an optional environment string.
 * Pure by design: the caller reads `process.env` and passes the raw value in;
 * anything unparseable, non-positive or non-finite falls back to the default.
 */
export function resolveBulkMaxItems(
  raw: string | null | undefined,
  fallback: number = AI_BULK_MAX_ITEMS,
): number {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

/**
 * Returns the duplicated ids of a list, each once, in order of their second
 * occurrence. Empty when the list is unique.
 */
export function findDuplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const id of ids) {
    if (seen.has(id)) {
      if (!duplicates.includes(id)) {
        duplicates.push(id);
      }
      continue;
    }
    seen.add(id);
  }

  return duplicates;
}

/**
 * Basic bulk input validation for a job's perfume id list: non-empty, every
 * entry a usable id, no duplicates and within the max-item limit. Deliberately
 * does NOT validate perfume payloads (that stays with the existing Phase 6A
 * validator) and does NOT touch the database.
 */
export function validateBulkPerfumeIds(
  ids: unknown,
  maxItems: number = AI_BULK_MAX_ITEMS,
): BulkValidationResult {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, reason: "فهرست عطرها خالی است." };
  }

  if (ids.length > maxItems) {
    return {
      ok: false,
      reason: `تعداد عطرها بیشتر از حد مجاز است (${maxItems} مورد).`,
    };
  }

  for (const id of ids) {
    if (typeof id !== "string" || id.trim() === "") {
      return { ok: false, reason: "شناسهٔ عطر نامعتبر است." };
    }
  }

  const duplicates = findDuplicateIds(ids);

  if (duplicates.length > 0) {
    return { ok: false, reason: "شناسه‌های تکراری در فهرست عطرها وجود دارد." };
  }

  return OK;
}

/** Guard for job state transitions (see `BULK_JOB_TRANSITIONS`). */
export function canTransitionJobStatus(from: BulkJobStatus, to: BulkJobStatus): boolean {
  return (BULK_JOB_TRANSITIONS[from] as readonly BulkJobStatus[]).includes(to);
}

/** Guard for item state transitions (see `BULK_ITEM_TRANSITIONS`). */
export function canTransitionItemStatus(from: BulkItemStatus, to: BulkItemStatus): boolean {
  return (BULK_ITEM_TRANSITIONS[from] as readonly BulkItemStatus[]).includes(to);
}

/* --------------------------------------------------------------------------- */
/* Phase 12.4 — fill-only profile semantics                                     */
/* --------------------------------------------------------------------------- */

/** The descriptor-only fragrance dimensions AI may write (never the 9 axes). */
export type DescriptorDimension = (typeof DESCRIPTOR_DIMENSIONS)[number];

/**
 * Plain-data profile write computed by `computeBulkProfileWrite` and applied
 * atomically by the bulk service inside the winning transaction. It contains
 * ONLY eligible AI-eligible fields — never a matching axis, never a
 * merchant-provided non-zero value.
 */
export interface BulkProfileWrite {
  descriptors: Partial<Record<DescriptorDimension, number>>;
  family?: string;
  notes?: string[];
}

/** The stored descriptor/family/notes facts of an existing profile (or absence). */
export interface ExistingProfileFacts {
  descriptors: Partial<Record<DescriptorDimension, number | null>>;
  family?: string | null;
  notes?: string[] | null;
}

/** True when a descriptor's stored value is absent or explicitly 0 — fillable. */
function isFillableDescriptor(value: number | null | undefined): boolean {
  return typeof value !== "number" || value === 0;
}

/**
 * Fill-only merge of a validated AI result with the stored profile (Phase 12.4).
 *
 * Non-negotiable rules:
 *  - an EXISTING non-zero descriptor value (CSV / manual / admin data) always
 *    wins — AI never overwrites merchant data, and the preserved value is
 *    structurally absent from the applied write;
 *  - absent (`null`) or zero descriptors may be filled from the AI result;
 *  - an existing non-empty `family` always wins and stays structurally absent
 *    from the write; AI may fill an empty one;
 *  - existing non-empty `notes` always win and stay structurally absent from
 *    the write; AI may fill empty ones;
 *  - the nine protected matching axes are structurally absent from this type —
 *    they cannot be merged, let alone overwritten.
 *
 * Pure and deterministic: same inputs always produce the same write, which the
 * service applies inside the winning per-item transaction.
 */
export function computeBulkProfileWrite(
  existing: ExistingProfileFacts,
  ai: { descriptors: Partial<Record<DescriptorDimension, number>>; family?: string; notes?: string[] },
): BulkProfileWrite {
  const descriptors: Partial<Record<DescriptorDimension, number>> = {};

  for (const dimension of DESCRIPTOR_DIMENSIONS) {
    const aiValue = ai.descriptors[dimension];
    if (typeof aiValue !== "number") {
      continue;
    }

    const currentValue = existing.descriptors[dimension];
    if (isFillableDescriptor(currentValue)) {
      descriptors[dimension] = aiValue;
    }
  }

  const write: BulkProfileWrite = { descriptors };

  // Preserved merchant values are structurally ABSENT: only fields the AI
  // actually fills travel in the write, so the applied update can never touch
  // them — the "cannot be overwritten" guarantee is structural, not incidental.
  const existingFamily = existing.family?.trim() ?? "";
  if (existingFamily === "" && ai.family !== undefined && ai.family.trim() !== "") {
    write.family = ai.family.trim();
  }

  const existingNotes = existing.notes ?? [];
  if (existingNotes.length === 0 && ai.notes !== undefined && ai.notes.length > 0) {
    write.notes = ai.notes;
  }

  return write;
}
