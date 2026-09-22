import { selectUserTraits } from "@/lib/ai/explanation";
import type {
  AiExplanationInput,
  AiPerfumeProfileInput,
} from "@/lib/ai/provider";
import { matchPerfumes } from "@/lib/matching/engine";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { PersonalityVector } from "@/types/personality";
import type {
  MatchCandidateInput,
  MatchResult,
} from "@/types/recommendation";

/**
 * Shared fixtures for the Phase 4 suites.
 *
 * Deliberately digit-free (names, brands, notes, descriptions) so tests can assert
 * that no numbers travel to the AI, and no network or database is involved.
 */

export const TEST_STORE_ID = "store-test";
export const TEST_PERFUME_ID = "perfume-test-noir";
export const TEST_ARCHETYPE_LABEL = "کاشف مرموز";

/** A flat 0–100 vector: every dimension set to `value`. */
export function makeVector(value = 50): PersonalityVector {
  return Object.fromEntries(
    PERSONALITY_DIMENSIONS.map((dimension) => [dimension, value]),
  ) as PersonalityVector;
}

/** Same profile as `makeVector`, with one axis shifted (creates a non-perfect match). */
export function shiftedProfile(
  base: number,
  dimension: (typeof PERSONALITY_DIMENSIONS)[number],
  offset: number,
): Partial<Record<(typeof PERSONALITY_DIMENSIONS)[number], number>> {
  return { ...makeVector(base), [dimension]: base + offset };
}

function candidate(
  perfumeId: string,
  name: string,
  brand: string,
  profile: MatchCandidateInput["profile"],
): MatchCandidateInput {
  return {
    perfumeId,
    storeId: TEST_STORE_ID,
    name,
    brand,
    slug: perfumeId,
    productUrl: `https://demo.example.com/p/${perfumeId}`,
    imageUrl: null,
    inStock: true,
    active: true,
    profile,
  };
}

/** A realistic deterministic result, produced by the real engine (no mocks). */
export function makeMatchResult(): MatchResult {
  return matchPerfumes({
    storeId: TEST_STORE_ID,
    personalityVector: makeVector(50),
    perfumes: [
      candidate(TEST_PERFUME_ID, "نویر آزمون", "خانه آزمون", shiftedProfile(50, "bold", 5)),
      candidate("perfume-test-fresh", "تازه آزمون", "خانه آزمون", shiftedProfile(50, "bold", 30)),
    ],
  });
}

export function makeProfileInput(
  overrides: Partial<AiPerfumeProfileInput> = {},
): AiPerfumeProfileInput {
  return {
    perfumeId: TEST_PERFUME_ID,
    name: "نویر آزمون",
    brand: "خانه آزمون",
    description: "عطری گرم و چوبی برای شب‌های خاص",
    family: "woody amber",
    notes: ["عود", "چرم"],
    matchingProfile: makeVector(50),
    ...overrides,
  };
}

export function makeExplanationInput(
  overrides: Partial<AiExplanationInput> = {},
): AiExplanationInput {
  const result = makeMatchResult();
  const recommendation = result.recommendations[0];

  return {
    recommendation,
    archetypeLabel: TEST_ARCHETYPE_LABEL,
    perfume: {
      perfumeId: recommendation.perfumeId,
      name: recommendation.name,
      brand: recommendation.brand,
      description: "عطری گرم و چوبی برای شب‌های خاص",
      family: "woody amber",
      notes: ["عود", "چرم"],
    },
    traits: selectUserTraits(makeVector(50)),
    ...overrides,
  };
}
