import { createAIProvider } from "@/lib/ai/provider";
import {
  generateExplanations,
  selectUserTraits,
} from "@/lib/ai/explanation";
import {
  getRecommendations,
  type RecommendationSource,
} from "@/lib/matching/service";
import { RESULTS_TOP_N } from "@/lib/results/params";
import { recordAnalyticsEvent } from "@/lib/analytics/service";
import type { AiExplanationInput } from "@/lib/ai/provider";
import type {
  MatchedPerfume,
  MatchResult,
} from "@/types/recommendation";
import type { PersonalityVector } from "@/types/personality";
import type { ResultsParams } from "@/lib/results/params";

/**
 * Server-side orchestration for the results page (Phase 5).
 *
 * Flow, in strict order:
 *   1. `getRecommendations` (Phase 3) produces the ranked Top-N — the single
 *      source of truth for which perfumes appear, in which order, at which
 *      score. This module never re-scores, re-ranks or re-orders.
 *   2. `generateExplanations` (Phase 4) attaches optional Persian copy. Any
 *      failure degrades to `{ ok: false }` per the Phase 4 contract and leaves
 *      the deterministic list untouched.
 *
 * Server-only by design: it imports the Prisma repository (via the matching
 * service) and reads the AI credentials. Client components must never import
 * this module.
 */

/** What the results page renders, straight from the two existing layers. */
export interface ResultsViewData {
  recommendations: MatchedPerfume[];
  /** AI copy keyed by perfumeId — present only where the provider answered. */
  explanations: Map<string, string>;
  /** False whenever the AI layer is missing, slow or failing (Phase 4). */
  aiAvailable: boolean;
  /** True when the deterministic engine found no eligible perfume. */
  isEmpty: boolean;
}

/**
 * Builds the Phase 4 explanation inputs straight from the engine output.
 *
 * Scores and ranks are never sent to the model (enforced in `lib/ai`); only
 * facts, the archetype label and the qualitative trait bands cross the
 * boundary.
 */
export function buildExplanationInputs(
  recommendations: readonly MatchedPerfume[],
  vector: PersonalityVector,
  archetypeLabel: string,
): AiExplanationInput[] {
  // selectUserTraits picks the user's most pronounced traits (top 4 by value,
  // canonical order on ties) — the exact prompt input Phase 4 designed.
  const traits = selectUserTraits(vector);

  return recommendations.map((recommendation) => ({
    recommendation,
    archetypeLabel,
    perfume: {
      perfumeId: recommendation.perfumeId,
      name: recommendation.name,
      brand: recommendation.brand,
    },
    traits,
  }));
}

/**
 * Runs the engine, then the optional AI pass, and returns everything the
 * results page needs. Never throws for AI reasons; a thrown engine error
 * (invalid vector / store) propagates to the page's error boundary.
 *
 * Phase 7: also records RESULT_VIEWED and RECOMMENDATIONS_SHOWN server-side —
 * a server component renders exactly once per real navigation, so no client
 * dedupe is needed for these two. Analytics failures are swallowed inside the
 * recorder and can never alter the recommendations.
 */
export async function getResultsViewData(
  params: ResultsParams,
  sourceOverride?: RecommendationSource,
): Promise<ResultsViewData> {
  const { vector, archetype, storeId } = params;

  // Mode selection: an explicit `source` query param wins (demo links can pin
  // REFERENCE_CATALOG); otherwise a real store context means merchant
  // inventory, and the storeless default demo experience uses the catalog.
  // Mode selection lives entirely in the parsed params (`lib/results/params.ts`):
  // an explicit `?source=` wins; otherwise a store context means merchant
  // inventory and the storeless default experience uses the demo catalog.
  const source: RecommendationSource = sourceOverride ?? params.source;

  const matchResult: MatchResult = await getRecommendations({
    storeId,
    personalityVector: vector,
    topN: RESULTS_TOP_N,
    source,
  });

  const recommendations = matchResult.recommendations;

  // Reference-catalog mode is a demo: no real store context exists, so no
  // store-scoped analytics are recorded (unknown store ids are rejected by
  // the analytics service anyway — skipping avoids the wasted DB round-trip).
  const isDemo = source === "REFERENCE_CATALOG";

  if (recommendations.length === 0) {
    // A valid profile rendered with zero eligible perfumes still counts as a
    // result view — but there is no recommendation list to count.
    if (!isDemo) await recordAnalyticsEvent({ eventType: "RESULT_VIEWED", storeId });

    return {
      recommendations: [],
      explanations: new Map(),
      aiAvailable: false,
      isEmpty: true,
    };
  }

  // Reference-catalog mode is a demo and must NEVER trigger a paid AI
  // explanation call: no provider is even constructed, and the deterministic
  // list renders with no AI copy at all (the existing non-AI fallback).
  // Merchant mode keeps the existing Phase 4 behaviour unchanged.
  let explanations = new Map<string, string>();
  let aiAvailable = false;

  if (!isDemo) {
    const provider = createAIProvider();
    // Reference-catalog cards have no real merchant context (no storeId, no
    // product URL), so the AI explanation layer stays merchant-only — the
    // deterministic ranking is identical either way.
    aiAvailable = provider.isAvailable();

    const inputs = buildExplanationInputs(
      recommendations,
      vector,
      archetype.label,
    );

    explanations = await generateExplanations(provider, inputs);
  }

  if (!isDemo) {
    await recordAnalyticsEvent({ eventType: "RESULT_VIEWED", storeId });
    // One event per result page with the list size in metadata (§6) — the
    // per-perfume counts are derived in the dashboard roll-up.
    await recordAnalyticsEvent({
      eventType: "RECOMMENDATIONS_SHOWN",
      storeId,
      metadata: { count: recommendations.length },
    });
  }

  return {
    recommendations,
    explanations,
    aiAvailable,
    isEmpty: false,
  };
}
