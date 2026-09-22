import {
  FRAGRANCE_DIMENSIONS,
  type FragranceDimension,
} from "@/types/fragrance";
import {
  PERSONALITY_DIMENSIONS,
  type PersonalityDimension,
  type PersonalityVector,
} from "@/types/personality";

/**
 * Pure mapping helpers between database rows and the shapes the rest of the app
 * uses. No Prisma Client import lives here, so the helpers stay testable without
 * a database and can be reused by imports, seeds and (later) AI enrichment.
 *
 * The deterministic matching engine compares the nine **personality**
 * dimensions (`PersonalityDimension`) — the same axes the Phase 1 quiz produces.
 * `FragranceProfile` stores those nine as required 0–100 integers, plus optional
 * fragrance descriptors (`FragranceDimension`) such as `woody` or `longevity`.
 */

/** Lower/upper bound of every normalised profile value. */
export const PROFILE_MIN = 0;
export const PROFILE_MAX = 100;

/**
 * The nine axes the deterministic matching engine compares. They are exactly the
 * Phase 1 personality dimensions, which is why a user vector and a perfume
 * profile are comparable dimension by dimension.
 */
export const MATCHING_DIMENSIONS = PERSONALITY_DIMENSIONS;

export type MatchingDimension = PersonalityDimension;

/** A value as it may arrive from a row, an import or JSON. */
export type ProfileRowValue = number | null | undefined;

/** The nine required matching axes of a profile row. */
export type MatchingProfileRow = Record<MatchingDimension, number>;

/** Optional descriptor/intensity fields of a profile row (all 0–100). */
export type DescriptorProfileRow = Partial<
  Record<FragranceDimension, ProfileRowValue>
>;

/**
 * Fragrance dimensions that overlap with the nine matching axes. These are
 * shared, not duplicated: `fresh`, `warm`, `mysterious`, `elegant`, `bold`.
 */
export const SHARED_DIMENSIONS: readonly FragranceDimension[] = [
  "fresh",
  "warm",
  "mysterious",
  "elegant",
  "bold",
];

/**
 * The fragrance-only descriptors: everything in `FragranceDimension` that is
 * NOT a personality axis.
 */
export const DESCRIPTOR_DIMENSIONS: readonly FragranceDimension[] = [
  "sweet",
  "woody",
  "spicy",
  "floral",
  "citrus",
  "aquatic",
  "smoky",
  "clean",
  "longevity",
  "projection",
];

/** True when a fragrance dimension is also one of the nine matching axes. */
export function isSharedDimension(
  dimension: FragranceDimension,
): dimension is FragranceDimension & MatchingDimension {
  return (SHARED_DIMENSIONS as readonly string[]).includes(dimension);
}

/** True for an integer inside 0–100 — the only values the engine accepts. */
export function isProfileValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= PROFILE_MIN &&
    value <= PROFILE_MAX
  );
}

/**
 * Rounds and clamps any incoming value into 0–100.
 *
 * Used on the write side (imports, seeds, AI enrichment) so a typo can never
 * store an out-of-range profile value.
 */
export function clampProfileValue(value: ProfileRowValue): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return PROFILE_MIN;
  }

  return Math.min(PROFILE_MAX, Math.max(PROFILE_MIN, Math.round(value)));
}

/**
 * Nine-axis vector a matching run can use, or `null` when the row is missing,
 * not an object, or any axis is missing or out of range. Returning `null` keeps
 * the engine from scoring incomplete or malformed data.
 */
export function toMatchingVector(
  row: Partial<Record<MatchingDimension, ProfileRowValue>> | null | undefined,
): PersonalityVector | null {
  if (typeof row !== "object" || row === null) {
    return null;
  }

  const entries: Array<[PersonalityDimension, number]> = [];

  for (const dimension of MATCHING_DIMENSIONS) {
    const value = row[dimension];

    if (!isProfileValue(value)) {
      return null;
    }

    entries.push([dimension, value]);
  }

  return Object.fromEntries(entries) as PersonalityVector;
}

/**
 * The full fragrance profile view: nine matching axes plus the optional
 * descriptors. Missing descriptors default to 0.
 */
export interface FragranceProfileView {
  matching: PersonalityVector;
  descriptors: Record<FragranceDimension, number>;
}

export function toFragranceProfileView(
  row: MatchingProfileRow & DescriptorProfileRow,
): FragranceProfileView {
  const matching = Object.fromEntries(
    MATCHING_DIMENSIONS.map((dimension) => [dimension, clampProfileValue(row[dimension])]),
  ) as PersonalityVector;

  const descriptors = Object.fromEntries(
    FRAGRANCE_DIMENSIONS.map((dimension) => [
      dimension,
      isSharedDimension(dimension)
        ? clampProfileValue(row[dimension as MatchingDimension])
        : clampProfileValue(row[dimension] ?? PROFILE_MIN),
    ]),
  ) as Record<FragranceDimension, number>;

  return { matching, descriptors };
}
