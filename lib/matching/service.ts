import { matchPerfumes } from "@/lib/matching/engine";
import { getEligiblePerfumesForStore } from "@/lib/matching/repository";
import type { MatchResult } from "@/types/recommendation";

/**
 * Recommendation service: personality vector + store inventory → ranked list.
 *
 * Flow: validate inputs → load the store's active perfumes (Prisma, server-side)
 * → hand the plain candidates to the pure engine → ranked Top-N result.
 *
 * The service itself is deterministic given the same database state; it performs
 * no AI calls and persists nothing (Phase 4+ will store QuizSession results).
 */
export interface GetRecommendationsInput {
  storeId: unknown;
  /** The Phase 1 personality vector; validated before any query runs. */
  personalityVector: unknown;
  topN?: unknown;
}

export async function getRecommendations(
  input: GetRecommendationsInput,
): Promise<MatchResult> {
  const storeId = input.storeId;

  if (typeof storeId !== "string" || storeId.trim().length === 0) {
    throw new Error("invalid storeId: expected a non-empty string.");
  }

  const perfumes = await getEligiblePerfumesForStore(storeId);

  return matchPerfumes({
    storeId,
    personalityVector: input.personalityVector,
    perfumes,
    topN: input.topN,
  });
}
