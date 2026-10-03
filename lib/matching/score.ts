import {
  MATCHING_DIMENSIONS,
  PROFILE_MAX,
  PROFILE_MIN,
  type MatchingProfileRow,
} from "@/lib/fragrance/profile";
import type { PersonalityVector } from "@/types/personality";

/**
 * Deterministic similarity scoring for the matching engine.
 *
 * The user vector carries nine personality axes; the comparison runs over the
 * five `MATCHING_DIMENSIONS` where every axis is normalised to 0–100 (Phase 1
 * normalisation for the user, `FragranceProfile` columns for the perfume). Nothing here reads the clock, uses randomness or
 * talks to any service, so identical inputs always produce identical output.
 *
 * Formula
 * -------
 *   difference           = userValue - perfumeValue          (per dimension)
 *   distance             = sqrt(Σ difference²)        (Euclidean, over
 *   MAX_DISTANCE         = sqrt(5 × 100²) ≈ 223.6068  MATCHING_DIMENSIONS)
 *   similarity           = 100 × (1 - distance / MAX_DISTANCE)
 *
 * Mathematically the similarity is exactly 100 for an exact match (distance 0)
 * and exactly 0 for the maximum possible distance; the clamp below only
 * guards floating-point edge cases. There are no magic constants: 100 is the
 * axis scale (`PROFILE_MAX`) and the axis count is `MATCHING_DIMENSIONS.length`.
 *
 * DIMENSIONALITY: the denominator is dimension-count dependent. It was
 * √(9 × 100²) = 300 while all nine axes were compared, and is now
 * √(5 × 100²) because social/adventurous/expressive/experimental no longer
 * take part. Raw score magnitudes therefore rise for an unchanged ranking —
 * only the ORDER is comparable across that change.
 */

/** Longest possible Euclidean distance in the active matching space (0–100). */
export const MAX_DISTANCE = Math.sqrt(
  MATCHING_DIMENSIONS.length * PROFILE_MAX ** 2,
);

/** The similarity scale is the same 0–100 range as the axes themselves. */
export const SIMILARITY_MIN = PROFILE_MIN;
export const SIMILARITY_MAX = PROFILE_MAX;

/**
 * Presentation rounding: one decimal place, `round(score × 10) / 10`.
 *
 * The raw score is the mathematically precise value used for ranking; the
 * presentation score exists only for display. Rounding happens exactly once, at
 * the end — never on intermediate values.
 */
export const PRESENTATION_SCALE = 10;

export interface SimilarityScore {
  /** Raw Euclidean distance (not rounded). */
  distance: number;
  /** Raw similarity score, 0–100 (not rounded). */
  rawScore: number;
  /** `round(rawScore × 10) / 10` — display only. */
  presentationScore: number;
}

export function computeDistance(
  vector: PersonalityVector,
  profile: MatchingProfileRow,
): number {
  let squaredSum = 0;

  for (const dimension of MATCHING_DIMENSIONS) {
    const difference = vector[dimension] - profile[dimension];
    squaredSum += difference * difference;
  }

  return Math.sqrt(squaredSum);
}

function clampSimilarity(value: number): number {
  return Math.min(SIMILARITY_MAX, Math.max(SIMILARITY_MIN, value));
}

/** Presentation score: one decimal place, deterministic. */
export function toPresentationScore(rawScore: number): number {
  return Math.round(rawScore * PRESENTATION_SCALE) / PRESENTATION_SCALE;
}

/** Full deterministic score for one user/perfume pair. */
export function similarityScore(
  vector: PersonalityVector,
  profile: MatchingProfileRow,
): SimilarityScore {
  const distance = computeDistance(vector, profile);
  const rawScore = clampSimilarity(
    SIMILARITY_MAX * (1 - distance / MAX_DISTANCE),
  );

  return {
    distance,
    rawScore,
    presentationScore: toPresentationScore(rawScore),
  };
}
