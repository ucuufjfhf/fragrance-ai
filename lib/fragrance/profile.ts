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
 * `FragranceProfile` stores the nine **personality** dimensions as required
 * 0–100 integers (plus optional fragrance descriptors such as `woody` or
 * `longevity`). The deterministic matching engine compares only FIVE of those
 * axes — `MATCHING_DIMENSIONS` — because the other four are user-personality
 * dimensions that no fragrance data can speak to. The stored profile shape and
 * the matching metric are separate concerns and are named separately here.
 */

/** Lower/upper bound of every normalised profile value. */
export const PROFILE_MIN = 0;
export const PROFILE_MAX = 100;

/**
 * The axes STORED on a `FragranceProfile` row (and in the admin forms, CSV
 * import/export and results URL parameters).
 *
 * They are exactly the nine Phase 1 personality dimensions, because that is the
 * product's user-side vocabulary. That is a property of the *stored profile
 * shape*, NOT of the matching metric — the two are deliberately separate (see
 * `MATCHING_DIMENSIONS`).
 */
export const PROFILE_AXES = PERSONALITY_DIMENSIONS;

/**
 * The five axes the deterministic matching engine actually compares.
 *
 * This list is explicit: it is no longer derived from the personality
 * dimensions. `social`, `adventurous`, `expressive` and `experimental` are
 * user-personality dimensions that remain fully valid in `PersonalityVector`,
 * the quiz, the archetypes and the stored profile — but a perfume has no
 * fragrance-side signal for them, so they must not consume similarity budget.
 *
 * The removed axes were measured as constant (40) on every fragrance profile, so
 * their contribution to the squared distance was identical for every candidate:
 * they could never change a ranking, only inflate every distance by a fixed
 * amount. Removing them is therefore ranking-neutral by construction.
 */
export const MATCHING_DIMENSIONS = [
  "fresh",
  "warm",
  "mysterious",
  "elegant",
  "bold",
] as const satisfies readonly PersonalityDimension[];

export type MatchingDimension = (typeof MATCHING_DIMENSIONS)[number];

/** Axes a perfume profile must still carry but matching never reads. */
export const NON_MATCHING_PROFILE_AXES = PROFILE_AXES.filter(
  (axis) => !(MATCHING_DIMENSIONS as readonly string[]).includes(axis),
);

/** A value as it may arrive from a row, an import or JSON. */
export type ProfileRowValue = number | null | undefined;

/** The five axes a matching run compares on the perfume side. */
export type MatchingProfileRow = Record<MatchingDimension, number>;

/** Optional descriptor/intensity fields of a profile row (all 0–100). */
export type DescriptorProfileRow = Partial<
  Record<FragranceDimension, ProfileRowValue>
>;

/**
 * Fragrance dimensions that overlap with the five matching axes. These are
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

/** True when a fragrance dimension is also one of the five matching axes. */
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
 * A complete nine-axis profile row, or `null` when the row is missing, not an
 * object, or ANY stored axis is missing or out of range.
 *
 * This is the *profile completeness* check: it keeps the documented eligibility
 * contract unchanged (a partially profiled perfume is still excluded) and it
 * validates the user vector, which is always all nine dimensions.
 */
export function toPersonalityVector(
  row: Partial<Record<PersonalityDimension, ProfileRowValue>> | null | undefined,
): PersonalityVector | null {
  if (typeof row !== "object" || row === null) {
    return null;
  }

  const entries: Array<[PersonalityDimension, number]> = [];

  for (const dimension of PROFILE_AXES) {
    const value = row[dimension];

    if (!isProfileValue(value)) {
      return null;
    }

    entries.push([dimension, value]);
  }

  return Object.fromEntries(entries) as PersonalityVector;
}

/**
 * Projects a validated profile row onto the five axes matching compares.
 *
 * Returns `null` for a missing/malformed row so callers keep a total function;
 * on an already-validated nine-axis row it never fails.
 */
export function toMatchingProfile(
  row: Partial<Record<PersonalityDimension, ProfileRowValue>> | null | undefined,
): MatchingProfileRow | null {
  if (typeof row !== "object" || row === null) {
    return null;
  }

  const entries: Array<[MatchingDimension, number]> = [];

  for (const dimension of MATCHING_DIMENSIONS) {
    const value = row[dimension as PersonalityDimension];

    if (!isProfileValue(value)) {
      return null;
    }

    entries.push([dimension, value]);
  }

  return Object.fromEntries(entries) as MatchingProfileRow;
}

/**
 * The full fragrance profile view: the nine stored profile axes plus the
 * optional descriptors. Missing descriptors default to 0.
 */
export interface FragranceProfileView {
  matching: PersonalityVector;
  descriptors: Record<FragranceDimension, number>;
}

export function toFragranceProfileView(
  row: Partial<Record<PersonalityDimension, ProfileRowValue>> & DescriptorProfileRow,
): FragranceProfileView {
  const matching = Object.fromEntries(
    PROFILE_AXES.map((dimension) => [dimension, clampProfileValue(row[dimension])]),
  ) as PersonalityVector;

  const descriptors = Object.fromEntries(
    FRAGRANCE_DIMENSIONS.map((dimension) => [
      dimension,
      isSharedDimension(dimension)
        ? clampProfileValue(
            row[dimension as FragranceDimension & PersonalityDimension],
          )
        : clampProfileValue(row[dimension] ?? PROFILE_MIN),
    ]),
  ) as Record<FragranceDimension, number>;

  return { matching, descriptors };
}
