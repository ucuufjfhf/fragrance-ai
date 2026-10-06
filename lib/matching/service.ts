import { matchPerfumes } from "@/lib/matching/engine";
import { getEligiblePerfumesForStore } from "@/lib/matching/repository";
import { getReferenceCatalogCandidates } from "@/lib/matching/reference-catalog";
import type { AudienceGender } from "@/lib/audience";
import type { SeasonFilter } from "@/lib/context";
import type { Occasion } from "@/types/fragrance";
import type { MatchResult } from "@/types/recommendation";

/**
 * Where the matching engine's candidates come from.
 *
 * There is still ONE deterministic engine — only the candidate collection
 * changes:
 *  - `MERCHANT_INVENTORY`: the store's own active, in-stock `Perfume` rows
 *    (production; never contains reference-catalog records).
 *  - `REFERENCE_CATALOG`: the bundled demo reference dataset (demo/MVP;
 *    never reads or writes any store's inventory).
 */
export type RecommendationSource = "MERCHANT_INVENTORY" | "REFERENCE_CATALOG";

/** Production default: the merchant's own inventory (backwards-compatible). */
export const DEFAULT_RECOMMENDATION_SOURCE: RecommendationSource = "MERCHANT_INVENTORY";

/**
 * Recommendation service: personality vector + candidate source → ranked list.
 *
 * Flow: validate inputs → load candidates from the selected source (server-side)
 * → hand the plain candidates to the pure engine → ranked Top-N result.
 *
 * The service itself is deterministic given the same source state; it performs
 * no AI calls and persists nothing (Phase 4+ will store QuizSession results).
 */
export interface GetRecommendationsInput {
  storeId: unknown;
  /** The Phase 1 personality vector; validated before any query runs. */
  personalityVector: unknown;
  topN?: unknown;
  /** Candidate source; defaults to `DEFAULT_RECOMMENDATION_SOURCE`. */
  source?: RecommendationSource;
  /**
   * The shopper's audience selection, threaded straight through to the engine's
   * eligibility pass. Never part of the personality vector; omitted → legacy
   * (no gender filter).
   */
  targetGender?: AudienceGender | null;
  /**
   * Optional purchase context from the context step, threaded straight
   * through to the engine's eligibility pass. Never part of the personality
   * vector; omitted/null → no filter (legacy behaviour).
   */
  targetSeason?: SeasonFilter | null;
  targetOccasion?: Occasion | null;
}

function resolveSource(source: unknown): RecommendationSource {
  if (source === undefined || source === null || source === "") {
    return DEFAULT_RECOMMENDATION_SOURCE;
  }
  if (source === "MERCHANT_INVENTORY" || source === "REFERENCE_CATALOG") {
    return source;
  }
  throw new Error(
    `invalid recommendation source: expected "MERCHANT_INVENTORY" or "REFERENCE_CATALOG", received ${String(source)}.`,
  );
}

export async function getRecommendations(
  input: GetRecommendationsInput,
): Promise<MatchResult> {
  const storeId = input.storeId;

  if (typeof storeId !== "string" || storeId.trim().length === 0) {
    throw new Error("invalid storeId: expected a non-empty string.");
  }

  const source = resolveSource(input.source);

  // Reference mode: candidates come from the bundled catalog and carry their
  // own synthetic store id — the engine is called WITHOUT the merchant store
  // filter so it never mixes the two worlds in either direction.
  if (source === "REFERENCE_CATALOG") {
    return matchPerfumes({
      personalityVector: input.personalityVector,
      perfumes: getReferenceCatalogCandidates(),
      topN: input.topN,
      targetGender: input.targetGender ?? null,
      targetSeason: input.targetSeason ?? null,
      targetOccasion: input.targetOccasion ?? null,
    });
  }

  const perfumes = await getEligiblePerfumesForStore(storeId);

  return matchPerfumes({
    storeId,
    personalityVector: input.personalityVector,
    perfumes,
    topN: input.topN,
    targetGender: input.targetGender ?? null,
    targetSeason: input.targetSeason ?? null,
    targetOccasion: input.targetOccasion ?? null,
  });
}
