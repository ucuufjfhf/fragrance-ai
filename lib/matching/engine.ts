import {
  toMatchingProfile,
  toPersonalityVector,
} from "@/lib/fragrance/profile";
import { similarityScore } from "@/lib/matching/score";
import { isGenderEligibleFor, type AudienceGender } from "@/lib/audience";
import type { PersonalityVector } from "@/types/personality";
import type {
  MatchCandidateInput,
  MatchResult,
  MatchedPerfume,
} from "@/types/recommendation";

/**
 * The pure, deterministic matching engine.
 *
 * Inputs are plain objects — no Prisma, no AI, no clock, no randomness. The same
 * personality vector, inventory and options always produce the same ordered
 * result, which is why this module can be unit-tested without a database.
 */

/** Default number of recommendations returned. */
export const DEFAULT_TOP_N = 5;

/**
 * Validates the requested result size.
 *
 * Accepts a positive integer; anything else (0, negative, fractional, non-number)
 * is rejected with a clear error instead of being silently coerced.
 */
export function resolveTopN(topN: unknown): number {
  if (topN === undefined) {
    return DEFAULT_TOP_N;
  }

  if (
    typeof topN !== "number" ||
    !Number.isInteger(topN) ||
    topN < 1
  ) {
    throw new Error(
      `invalid topN: expected a positive integer, received ${String(topN)}.`,
    );
  }

  return topN;
}

/** Validates a user personality vector produced by Phase 1. */
export function validatePersonalityVector(vector: unknown): PersonalityVector {
  const valid = toPersonalityVector(
    vector as Partial<Record<keyof PersonalityVector, number | null | undefined>>,
  );

  if (!valid) {
    throw new Error(
      "invalid personality vector: all 9 dimensions must be integers between 0 and 100.",
    );
  }

  return valid;
}

export interface MatchPerfumesInput {
  /**
   * Optional tenant filter. When set, candidates from any other store are
   * excluded — defence in depth on top of the server-side database query.
   */
  storeId?: string;
  /** Validated inside the engine; invalid vectors fail loudly. */
  personalityVector: unknown;
  perfumes: readonly MatchCandidateInput[];
  topN?: unknown;
  /**
   * The shopper's audience selection (MEN/WOMEN), when one was made.
   *
   * A MERCHANDISING filter, not a personality dimension: it only gates
   * candidate eligibility (MEN → MEN + UNISEX, WOMEN → WOMEN + UNISEX) and is
   * checked BEFORE any similarity scoring. Omitted/unknown keeps the legacy
   * behaviour (no gender filter at all).
   */
  targetGender?: AudienceGender | null;
}

/**
 * Scores, ranks and truncates the candidate inventory.
 *
 * Eligibility policy (documented, deterministic):
 *  - candidates from another store are excluded (when `storeId` is given);
 *  - inactive perfumes are excluded;
 *  - out-of-stock perfumes are excluded ("out-of-stock is never recommended");
 *  - perfumes outside the shopper's selected audience are excluded BEFORE any
 *    scoring (MEN → MEN + UNISEX, WOMEN → WOMEN + UNISEX; no selection → no
 *    gender filter, so legacy URLs are unchanged);
 *  - perfumes with a missing or out-of-range profile are excluded — no
 *    arbitrary values are substituted for missing data.
 *
 * The distance is computed over `MATCHING_DIMENSIONS` only (fresh, warm,
 * mysterious, elegant, bold). `social`, `adventurous`, `expressive` and
 * `experimental` remain part of the user vector and the stored profile, but a
 * perfume carries no signal for them, so they are excluded from the metric.
 *
 * Sorting: similarity score descending; ties are broken by ascending
 * `perfumeId`, a stable field that does not depend on database row order.
 */
export function matchPerfumes(input: MatchPerfumesInput): MatchResult {
  const vector = validatePersonalityVector(input.personalityVector);
  const topN = resolveTopN(input.topN);

  const scored: MatchedPerfume[] = [];
  let excluded = 0;

  for (const candidate of input.perfumes) {
    if (input.storeId !== undefined && candidate.storeId !== input.storeId) {
      excluded += 1;
      continue;
    }

    if (candidate.active !== true) {
      excluded += 1;
      continue;
    }

    // Documented inventory contract: out-of-stock products are never
    // recommended (the flag is loaded alongside `active` for exactly this
    // check — scoring itself is untouched).
    if (candidate.inStock !== true) {
      excluded += 1;
      continue;
    }

    // Audience eligibility (documented merchandising rule): when the shopper
    // selected an audience, only that audience's genders survive. This runs
    // BEFORE the profile check and BEFORE any scoring, so an excluded perfume
    // can never influence the ranking. `isGenderEligibleFor` returns true when
    // no audience was selected, which is what keeps legacy URLs byte-identical.
    if (!isGenderEligibleFor(candidate.gender, input.targetGender)) {
      excluded += 1;
      continue;
    }

    // Eligibility still requires a COMPLETE nine-axis profile: the four
    // non-matching axes are not scored, but a partially profiled perfume is
    // still rejected exactly as before.
    const stored = toPersonalityVector(candidate.profile ?? {});

    if (!stored) {
      excluded += 1;
      continue;
    }

    // Only the five matching axes take part in the distance.
    const profile = toMatchingProfile(stored);

    if (!profile) {
      excluded += 1;
      continue;
    }

    const { distance, rawScore, presentationScore } = similarityScore(
      vector,
      profile,
    );

    scored.push({
      rank: 0,
      perfumeId: candidate.perfumeId,
      storeId: candidate.storeId,
      name: candidate.name,
      brand: candidate.brand,
      slug: candidate.slug ?? null,
      productUrl: candidate.productUrl ?? null,
      imageUrl: candidate.imageUrl ?? null,
      distance,
      score: rawScore,
      presentationScore,
      // Grounding facts for the AI explanation layer. Copied verbatim AFTER
      // scoring; never read by `similarityScore` and never used for
      // eligibility or ordering, so they cannot affect the result set.
      description: candidate.description ?? null,
      family: candidate.family ?? null,
      notes: candidate.notes ?? null,
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.perfumeId < b.perfumeId ? -1 : a.perfumeId > b.perfumeId ? 1 : 0;
  });

  const recommendations = scored
    .slice(0, topN)
    .map((perfume, index) => ({ ...perfume, rank: index + 1 }));

  return { recommendations, excluded };
}
