import { createAIProvider } from "@/lib/ai/provider";
import { createControlledAIProvider } from "@/lib/ai/cost-controls";
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
import { logEvent } from "@/lib/observability/logger";
import { PUBLIC_RATE_LIMITS, checkRateLimit } from "@/lib/rate-limit";
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
  // selectUserTraits picks the shopper's top scent traits (top 4 by value among
  // the five axes the matcher compares, matching order on ties). The archetype
  // still describes the full nine-axis vector; the traits do not, because the
  // other four axes never influenced which perfumes reached this list.
  const traits = selectUserTraits(vector);

  return recommendations.map((recommendation) => ({
    recommendation,
    archetypeLabel,
    perfume: {
      perfumeId: recommendation.perfumeId,
      name: recommendation.name,
      brand: recommendation.brand,
      // Real grounding facts when the store/profile has them. Missing values
      // stay null so the prompt keeps its existing `(نامشخص)` fallback rather
      // than inventing anything.
      description: recommendation.description ?? null,
      family: recommendation.family ?? null,
      notes: recommendation.notes ?? null,
    },
    traits,
  }));
}

/** Which budget, if any, suppressed this merchant render. */
type ResultRenderDenial = "requester" | "store";

/**
 * Applies the two `/result` budgets for a merchant render.
 *
 * The requester budget bounds one minter; the store budget bounds many
 * requesters aimed at one merchant's AI spend and funnel. The requester check
 * runs first, so a denied minter never spends the store's budget as well.
 *
 * `null` requester id = the caller supplied no request context (every
 * pre-existing caller, including the tests): no checks, exactly today's
 * behaviour.
 */
async function merchantRenderDenial(
  storeId: string,
  requesterId: string | null,
): Promise<ResultRenderDenial | null> {
  if (requesterId === null) return null;

  const requester = await checkRateLimit(
    `result:requester:${requesterId}`,
    PUBLIC_RATE_LIMITS.resultRequester,
  );
  if (!requester.allowed) return "requester";

  const store = await checkRateLimit(
    `result:store:${storeId}`,
    PUBLIC_RATE_LIMITS.resultStore,
  );
  if (!store.allowed) return "store";

  return null;
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
 *
 * Buyer audit round 7: `requesterId` (the page's `requesterIdentity`) enables
 * the two merchant-render budgets. Omitted/null is every pre-existing caller
 * and keeps today's behaviour exactly — no checks, no change.
 */
export async function getResultsViewData(
  params: ResultsParams,
  sourceOverride?: RecommendationSource,
  requesterId: string | null = null,
): Promise<ResultsViewData> {
  const { vector, archetype, storeId, audience, season, occasion } = params;

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
    // Audience is a merchandising filter only: it gates candidate eligibility
    // inside the engine and never reaches the personality vector. `null` = no
    // selection, i.e. the legacy unfiltered behaviour.
    targetGender: audience,
    // Optional purchase context (season/occasion) — hard eligibility filters
    // inside the engine, applied before scoring. `null` = no filter, exactly
    // the legacy behaviour; they never touch the vector or the ranking rules.
    targetSeason: season,
    targetOccasion: occasion,
  });

  const recommendations = matchResult.recommendations;

  // Reference-catalog mode is a demo: no real store context exists, so no
  // store-scoped analytics are recorded (unknown store ids are rejected by
  // the analytics service anyway — skipping avoids the wasted DB round-trip).
  const isDemo = source === "REFERENCE_CATALOG";

  // Merchant renders spend two budgets before either expensive effect — the AI
  // pass and the funnel writes — because `/result` is unsigned query params:
  // anyone can mint a URL for any public store id. A denial degrades to the
  // provider-failure render (no explanations, no events), never an error page.
  const suppressedBy = isDemo
    ? null
    : await merchantRenderDenial(storeId, requesterId);

  if (suppressedBy !== null) {
    // One line per suppressed render, no vector: enough to see a minting wave
    // without the log becoming a copy of the URL.
    logEvent("result_render_throttled", { storeId, limit: suppressedBy }, "warn");
  }

  if (recommendations.length === 0) {
    // A valid profile rendered with zero eligible perfumes still counts as a
    // result view — but there is no recommendation list to count.
    if (!isDemo && suppressedBy === null) {
      await recordAnalyticsEvent({ eventType: "RESULT_VIEWED", storeId });
    }

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

  if (!isDemo && suppressedBy === null) {
    // Same rate-limit + circuit-breaker wrapper the widget route already uses.
    // One implementation, unchanged limits: the results page gets the same
    // cost controls without a second cost-control code path.
    const provider = createControlledAIProvider(createAIProvider(), storeId);
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

  if (!isDemo && suppressedBy === null) {
    await recordAnalyticsEvent({ eventType: "RESULT_VIEWED", storeId });
    // One event per result page with the list size in metadata (§6) — the
    // per-perfume counts are derived in the dashboard roll-up.
    await recordAnalyticsEvent({
      eventType: "RECOMMENDATIONS_SHOWN",
      storeId,
      // `count` stays the list size; `perfumeIds` names exactly which perfumes
      // were on screen, in display order — so the report can count per-perfume
      // impressions without depending on a click (or on a product URL).
      metadata: {
        count: recommendations.length,
        perfumeIds: recommendations.map((row) => row.perfumeId),
      },
    });
  }

  return {
    recommendations,
    explanations,
    aiAvailable,
    isEmpty: false,
  };
}
