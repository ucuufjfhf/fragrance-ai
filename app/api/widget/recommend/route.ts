import { createAIProvider } from "@/lib/ai/provider";
import { generateExplanations, selectUserTraits } from "@/lib/ai/explanation";
import { getEligiblePerfumesForStore } from "@/lib/matching/repository";
import { matchPerfumes } from "@/lib/matching/engine";
import { RESULTS_TOP_N } from "@/lib/results/params";
import { getPrisma } from "@/lib/db";
import {
  isValidStoreId,
  validateWidgetVector,
  type WidgetRecommendation,
  type WidgetRecommendationResponse,
} from "@/lib/widget/contract";
import { widgetCorsHeaders } from "@/lib/widget/cors";
import {
  PUBLIC_RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
  requesterIdentity,
} from "@/lib/rate-limit";

import { createControlledAIProvider } from "@/lib/ai/cost-controls";

/**
 * POST /api/widget/recommend — the widget's recommendation endpoint (Phase 8).
 *
 * Server-side flow (§13) — the browser never scores anything and never sees
 * the inventory:
 *   validate store (exists + active) → validate vector (pure contract) →
 *   load eligible inventory (existing Phase 3 repository) → run the existing
 *   deterministic engine (single source of truth, untouched) → optional AI
 *   explanations (existing Phase 4 abstraction) → customer-safe payload.
 *
 * A widget configured for store A can never receive store B's perfumes: the
 * store check and the inventory query both key on the validated server-side
 * storeId, and perfume rows come only from that store's inventory.
 */

interface WidgetRecommendRequest {
  storeId?: unknown;
  personalityVector?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  let headers = widgetCorsHeaders(origin, null);

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "INVALID_JSON" }, { status: 400, headers });
  }

  const body = (typeof payload === "object" && payload !== null ? payload : {}) as WidgetRecommendRequest;

  // --- 1. store validation (server-side; never trusted from the client) ---
  if (!isValidStoreId(body.storeId)) {
    return Response.json({ ok: false, reason: "INVALID_ID" }, { status: 400, headers });
  }

  // Rate limits are applied after authoritative store lookup so the response
  // CORS decision uses that store's websiteUrl.

  const prisma = getPrisma();

  try {
    const store = await prisma.store.findFirst({
      where: { id: body.storeId, active: true },
      select: { id: true, websiteUrl: true },
    });
    headers = widgetCorsHeaders(origin, store?.websiteUrl);

    if (!store) {
      return Response.json({ ok: false, reason: "STORE_NOT_FOUND" }, { status: 404, headers });
    }
  } catch {
    return Response.json({ ok: false, reason: "STORE_NOT_FOUND" }, { status: 500, headers });
  }
  const requester = requesterIdentity(request);
  const requesterLimit = await checkRateLimit(`widget:requester:${requester}`, PUBLIC_RATE_LIMITS.widgetRequester);
  const storeLimit = await checkRateLimit(`widget:store:${body.storeId}`, PUBLIC_RATE_LIMITS.widgetStore);
  if (!requesterLimit.allowed || !storeLimit.allowed) {
    const limited = !requesterLimit.allowed ? requesterLimit : storeLimit;
    return rateLimitResponse(limited.retryAfterSeconds, { ok: false, reason: "RATE_LIMITED" }, headers);
  }



  // --- 2. vector validation (all nine axes, strict integers) ---
  const vector = validateWidgetVector(body.personalityVector);

  if (!vector.ok) {
    return Response.json({ ok: false, reason: "INVALID_VECTOR" }, { status: 400, headers });
  }

  // --- 3. inventory + engine (existing Phase 3 code, unmodified) ---
  const perfumes = await getEligiblePerfumesForStore(body.storeId);
  const matchResult = matchPerfumes({
    storeId: body.storeId,
    personalityVector: vector.vector,
    perfumes,
    topN: RESULTS_TOP_N,
  });

  // --- 4. optional AI explanations (existing Phase 4 abstraction) ---
  const provider = createControlledAIProvider(createAIProvider(), body.storeId);
  const aiAvailable = provider.isAvailable() && matchResult.recommendations.length > 0;

  const explanations = new Map<string, string>();

  if (aiAvailable) {
    const traits = selectUserTraits(vector.vector);
    const archetypeLabel = "دستیار عطری"; // Widget copy has no archetype context.

    try {
      const inputs = matchResult.recommendations.map((recommendation) => ({
        recommendation,
        archetypeLabel,
        perfume: {
          perfumeId: recommendation.perfumeId,
          name: recommendation.name,
          brand: recommendation.brand,
          // Real grounding facts when the store/profile has them; absent stays
          // null so the prompt keeps its `(نامشخص)` fallback.
          description: recommendation.description ?? null,
          family: recommendation.family ?? null,
          notes: recommendation.notes ?? null,
        },
        traits,
      }));

      const generated = await generateExplanations(provider, inputs);

      for (const [perfumeId, explanation] of generated) {
        explanations.set(perfumeId, explanation);
      }
    } catch {
      // Explanations are decoration — never block the recommendations.
    }
  }

  // --- 5. customer-safe payload (§12) ---
  const response: WidgetRecommendationResponse = {
    aiAvailable,
    recommendations: matchResult.recommendations.map(
      (recommendation): WidgetRecommendation => ({
        perfumeId: recommendation.perfumeId,
        rank: recommendation.rank,
        name: recommendation.name,
        brand: recommendation.brand,
        productUrl: recommendation.productUrl ?? null,
        imageUrl: recommendation.imageUrl ?? null,
        matchPercent: recommendation.presentationScore,
        explanation: explanations.get(recommendation.perfumeId),
      }),
    ),
  };

  return Response.json({ ok: true, ...response }, { status: 200, headers });
}

export async function OPTIONS(request: Request): Promise<Response> {
  const storeId = new URL(request.url).searchParams.get("storeId");
  const origin = request.headers.get("origin");
  const prisma = getPrisma();
  const store = storeId && isValidStoreId(storeId)
    ? await prisma.store.findFirst({ where: { id: storeId, active: true }, select: { websiteUrl: true } })
    : null;
  return new Response(null, { status: 204, headers: widgetCorsHeaders(origin, store?.websiteUrl) });
}
