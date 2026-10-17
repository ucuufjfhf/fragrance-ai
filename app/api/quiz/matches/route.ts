import { isAudienceGender } from "@/lib/audience";
import {
  getReferenceCatalogCandidates,
  REFERENCE_STORE_ID,
} from "@/lib/matching/reference-catalog";
import { getRecommendations } from "@/lib/matching/service";
import { scoreQuiz, validateAnswers } from "@/lib/personality/scoring";
import {
  PUBLIC_RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
  requesterIdentity,
} from "@/lib/rate-limit";
import type {
  QuizMatchesResponse,
  QuizSubmitErrorResponse,
} from "@/types/personality";

/**
 * POST /api/quiz/matches
 *
 * The Phase 2 beats' data source: the LIVE candidate-pool size (for the
 * filtering countdown) plus the real top-3 (for the performed-analysis
 * interstitial to cycle). Same deterministic engine and same reference-catalog
 * candidates as `/result` — this route never re-ranks, and the results page
 * stays the single source of truth for what is actually recommended.
 *
 * Body: `{ answers: QuizAnswer[], audience?: "MEN" | "WOMEN" }`. The audience
 * is validated exactly like everywhere else: unknown values degrade to no
 * filter instead of failing. Season/occasion are deliberately absent — the
 * beats run before the context step, so no purchase context exists yet.
 *
 * Responses:
 *  - 200 `QuizMatchesResponse`      for a valid answer sheet
 *  - 400 `QuizSubmitErrorResponse` for malformed JSON or invalid answers
 */
export async function POST(request: Request): Promise<Response> {
  const limit = await checkRateLimit(
    `quiz-matches:requester:${requesterIdentity(request)}`,
    PUBLIC_RATE_LIMITS.quizRequester,
  );
  if (!limit.allowed) {
    const body: QuizSubmitErrorResponse = {
      error: "RATE_LIMITED",
      reason: "too many requests; retry after the indicated delay.",
    };
    return rateLimitResponse(limit.retryAfterSeconds, body);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    const body: QuizSubmitErrorResponse = {
      error: "INVALID_JSON",
      reason: "request body must be valid JSON.",
    };
    return Response.json(body, { status: 400 });
  }

  const answers =
    typeof payload === "object" && payload !== null
      ? (payload as { answers?: unknown }).answers
      : undefined;
  const audience =
    typeof payload === "object" && payload !== null
      ? (payload as { audience?: unknown }).audience
      : undefined;

  const validation = validateAnswers(answers);

  if (!validation.ok) {
    const body: QuizSubmitErrorResponse = {
      error: "INVALID_ANSWERS",
      reason: validation.reason,
    };
    return Response.json(body, { status: 400 });
  }

  const matchResult = await getRecommendations({
    storeId: REFERENCE_STORE_ID,
    personalityVector: scoreQuiz(validation.answers).vector,
    topN: 3,
    source: "REFERENCE_CATALOG",
    targetGender: isAudienceGender(audience) ? audience : null,
  });

  const body: QuizMatchesResponse = {
    count: getReferenceCatalogCandidates().length,
    matches: matchResult.recommendations.map((recommendation) => ({
      perfumeId: recommendation.perfumeId,
      name: recommendation.name,
      brand: recommendation.brand,
    })),
  };
  return Response.json(body, { status: 200 });
}
