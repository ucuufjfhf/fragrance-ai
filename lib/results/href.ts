"use client";

import { getSessionToken } from "@/lib/analytics/flow-tracker";
import {
  serializeResultsParams,
  type ResultsRecommendationSource,
} from "@/lib/results/params";
import type { AudienceGender } from "@/lib/audience";
import type { SeasonFilter } from "@/lib/context";
import type { Occasion } from "@/types/fragrance";
import type { PersonalityVector, QuizAnswer } from "@/types/personality";

/**
 * The ONE builder for a quiz → /result link (batch 43).
 *
 * The results page is stateless: everything it knows arrives in the URL (see
 * `lib/results/params.ts`). The quiz has three places that build that link — the
 * post-result context step, the intro→result skip, and the profile card's own
 * CTA — and all three must agree on every token. Rather than repeat the call,
 * they all call this function, so a new param can never be added to one and
 * forgotten in another.
 *
 * The attempt token comes from its single owner, `getSessionToken()` in
 * `lib/analytics/flow-tracker.ts`: the exact value the attempt's QUIZ_STARTED /
 * QUIZ_COMPLETED events carried. Reading it here does not mint a second token —
 * by the time any of these links is built, the quiz has already started, so the
 * token exists. /result then stamps it on its server-fired RESULT_VIEWED and
 * RECOMMENDATIONS_SHOWN, which makes the funnel joinable.
 *
 * Client-only ("use client"): the builder reads the browser's sessionStorage.
 * The results page itself re-serialises server-side and passes the parsed value
 * through explicitly instead of calling this.
 */
export interface ResultsHrefInput {
  vector: PersonalityVector;
  archetypeId: string;
  storeId?: string;
  source?: ResultsRecommendationSource;
  audience?: AudienceGender | null;
  season?: SeasonFilter | null;
  occasion?: Occasion | null;
  answers?: readonly QuizAnswer[] | null;
}

/** `/result?…` for this outcome, carrying the attempt's session token. */
export function buildResultsHref(input: ResultsHrefInput): string {
  return `/result?${serializeResultsParams(
    input.vector,
    input.archetypeId,
    input.storeId,
    input.source,
    input.audience,
    input.season,
    input.occasion,
    input.answers,
    getSessionToken(),
  )}`;
}
