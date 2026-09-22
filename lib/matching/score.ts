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
 * Both vectors live in the same 9-dimensional space where every axis is
 * normalised to 0–100 (Phase 1 normalisation for the user, `FragranceProfile`
 * columns for the perfume). Nothing here reads the clock, uses randomness or
 * talks to any service, so identical inputs always produce identical output.
 *
 * Formula
 * -------
 *   difference           = userValue - perfumeValue          (per dimension)
 *   distance             = sqrt(Σ difference²)               (Euclidean, 9 dims)
 *   MAX_DISTANCE         = sqrt(9 × 100²) = 300              (maximal separation:
 *   similarity           = 100 × (1 - distance / MAX_DISTANCE)  every axis off by 100)
 *
 * Mathematically the similarity is exactly 100 for an exact match (distance 0)
 * and exactly 0 for the maximum possible distance (300); the clamp below only
 * guards floating-point edge cases. There are no magic constants: 100 is the
 * axis scale (`PROFILE_MAX`) and 9 is the axis count (`MATCHING_DIMENSIONS`).
 */

/** Longest possible Euclidean distance in the 9-dimensional 0–100 space. */
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
