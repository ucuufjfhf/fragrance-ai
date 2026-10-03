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
import { DESCRIPTOR_DIMENSIONS, PROFILE_AXES } from "@/lib/fragrance/profile";

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

/** Persisted provenance of a profile (mirrors the Prisma `ProfileSource` enum). */
export type ProfileProvenance = "REFERENCE" | "AI" | "MANUAL";

/** Where a bulk profile write's data came from (persisted provenance). */
export type BulkProfileWriteSource = ProfileProvenance;

/**
 * The nine matching axes a derivation produced, carried separately from the
 * fill-only fields: they are only ever present when the reference lookup or
 * the deterministic axis derivation PRODUCED them — never filled with 0/50 to
 * satisfy the schema. Structurally optional for that reason.
 */
export interface DerivedMatchingAxes {
  social: number;
  adventurous: number;
  expressive: number;
  mysterious: number;
  fresh: number;
  warm: number;
  experimental: number;
  elegant: number;
  bold: number;
}

/**
 * Plain-data profile write computed by `computeBulkProfileWrite` and applied
 * atomically by the bulk service inside the winning transaction. It contains
 * ONLY eligible fields — never a merchant-provided non-zero value.
 *
 * `matching` (when present) is a DETERMINISTICALLY DERIVED nine-axis vector
 * from the reference catalog or the axis-derivation utility — the only way a
 * matching axis ever enters a bulk write. When absent (no derivation), the
 * service persists the documented 0 default and the profile stays explicitly
 * incomplete rather than fabricated.
 */
export interface BulkProfileWrite {
  descriptors: Partial<Record<DescriptorDimension, number>>;
  family?: string;
  notes?: string[];
  /** Deterministically derived nine axes + the provenance of this write. */
  matching?: DerivedMatchingAxes;
  source: BulkProfileWriteSource;
}

/** The stored descriptor/family/notes facts of an existing profile (or absence). */
export interface ExistingProfileFacts {
  descriptors: Partial<Record<DescriptorDimension, number | null>>;
  family?: string | null;
  notes?: string[] | null;
  /** Stored matching axes, when the profile row has them (merchant data). */
  matchingAxes?: Partial<Record<(typeof PROFILE_AXES)[number], number>> | null;
  /**
   * Stored provenance, when the profile row has one. Automatic fill-only
   * enrichment must NEVER relabel a non-null value (see `computeBulkProfileWrite`).
   */
  profileSource?: ProfileProvenance | null;
}

/**
 * True for the legacy repairable state: EVERY one of the nine matching axes is
 * present and exactly 0. Older profiles were stamped with the schema's 0
 * default before deterministic derivation existed. Individual zeros stay VALID
 * merchant data — only the all-nine-zero row is treated as missing.
 */
function isLegacyAllZeroAxes(
  storedAxis: ExistingProfileFacts["matchingAxes"],
): boolean {
  return (
    storedAxis !== null &&
    storedAxis !== undefined &&
    PROFILE_AXES.every((axis) => storedAxis[axis] === 0)
  );
}

/** True when a descriptor's stored value is absent or explicitly 0 — fillable. */
function isFillableDescriptor(value: number | null | undefined): boolean {
  return typeof value !== "number" || value === 0;
}

/**
 * Fill-only merge of a validated structured result (reference-derived or AI)
 * with the stored profile (Phase 12.4 + the reference-first extension).
 *
 * Non-negotiable rules:
 *  - an EXISTING non-zero descriptor value (CSV / manual / admin data) always
 *    wins — AI never overwrites merchant data, and the preserved value is
 *    structurally absent from the applied write;
 *  - absent (`null`) or zero descriptors may be filled from the result;
 *  - an existing non-empty `family` always wins and stays structurally absent
 *    from the write; AI may fill an empty one;
 *  - existing non-empty `notes` always win and stay structurally absent from
 *    the write; AI may fill empty ones;
 *  - derived `matching` axes (reference or deterministic AI derivation) are
 *    carried through ONLY when the caller produced them — they are never
 *    invented here and never overwrite a stored axis; a stored axis value
 *    always wins structurally (see `existingAxes`).
 *
 * Pure and deterministic: same inputs always produce the same write, which the
 * service applies inside the winning per-item transaction.
 */
export function computeBulkProfileWrite(
  existing: ExistingProfileFacts,
  result: {
    descriptors: Partial<Record<DescriptorDimension, number>>;
    family?: string;
    notes?: string[];
    /** Deterministically derived axes from the reference/AI path, if any. */
    matching?: DerivedMatchingAxes;
    source: BulkProfileWriteSource;
  },
): BulkProfileWrite {
  const descriptors: Partial<Record<DescriptorDimension, number>> = {};

  for (const dimension of DESCRIPTOR_DIMENSIONS) {
    const resultValue = result.descriptors[dimension];
    if (typeof resultValue !== "number") {
      continue;
    }

    const currentValue = existing.descriptors[dimension];
    if (isFillableDescriptor(currentValue)) {
      descriptors[dimension] = resultValue;
    }
  }

  // Provenance is fill-only as well: a brand-new profile takes the write's true
  // source, but automatic enrichment must NEVER downgrade/relabel an existing
  // non-null value (MANUAL stays MANUAL, REFERENCE stays REFERENCE, AI stays AI).
  const existingSource = existing.profileSource ?? null;
  const write: BulkProfileWrite = {
    descriptors,
    source: existingSource ?? result.source,
  };

  // Preserved merchant values are structurally ABSENT: only fields the result
  // actually fills travel in the write, so the applied update can never touch
  // them — the "cannot be overwritten" guarantee is structural, not incidental.
  const existingFamily = existing.family?.trim() ?? "";
  if (existingFamily === "" && result.family !== undefined && result.family.trim() !== "") {
    write.family = result.family.trim();
  }

  const existingNotes = existing.notes ?? [];
  if (existingNotes.length === 0 && result.notes !== undefined && result.notes.length > 0) {
    write.notes = result.notes;
  }

  // Derived axes travel ONLY when the caller actually produced them AND either
  // no stored axis value exists (merchant data always wins) or the stored row
  // is the legacy all-nine-zero state — a known, repairable absence of data.
  // Individual zeros never trigger repair: only ALL NINE being exactly 0 does.
  const storedAxis = existing.matchingAxes;
  const hasStoredAxes =
    storedAxis !== null &&
    storedAxis !== undefined &&
    PROFILE_AXES.some((axis) => typeof storedAxis[axis] === "number");
  if (
    result.matching !== undefined &&
    (!hasStoredAxes || isLegacyAllZeroAxes(storedAxis))
  ) {
    write.matching = result.matching;
  }

  return write;
}
