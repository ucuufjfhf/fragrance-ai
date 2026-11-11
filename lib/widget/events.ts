"use client";

import { trackEvent } from "@/lib/analytics/client";
import { peekSessionToken } from "@/lib/analytics/flow-tracker";
import type { WidgetRecommendation } from "@/lib/widget/contract";

/**
 * The widget's ONE result-funnel dispatcher (batch 44).
 *
 * The widget surfaces a result in the merchant's own iframe, so its
 * RESULT_VIEWED and RECOMMENDATIONS_SHOWN were previously the last bare events
 * in a funnel whose quiz half already carried the attempt token. Both are
 * dispatched here, together, with the same rule:
 *
 *   attach the EXISTING attempt token via peek — never mint at result time.
 *
 * A token minted while the result renders would match no QUIZ_STARTED /
 * QUIZ_COMPLETED row and would fabricate an attempt. When peek finds none (the
 * shopper's storage is disabled, or the attempt never minted one) the events
 * fire exactly as before, with the `sessionId` key absent entirely.
 *
 * Extracted rather than inlined so the two events cannot drift apart — the same
 * reason `trackWidgetPerfumeClick` exists for the click. The payload parts are
 * unchanged: `storeId`, plus `count`/`perfumeIds` on RECOMMENDATIONS_SHOWN.
 */
export function trackWidgetResultEvents(
  storeId: string,
  recommendations: readonly WidgetRecommendation[],
): void {
  const sessionId = peekSessionToken();
  const sessionField = sessionId === undefined ? {} : { sessionId };

  void trackEvent({ eventType: "RESULT_VIEWED", storeId, ...sessionField });

  void trackEvent({
    eventType: "RECOMMENDATIONS_SHOWN",
    storeId,
    ...sessionField,
    // `count` is the list size; `perfumeIds` is what actually rendered, in
    // display order (the same enrichment the main quiz sends server-side).
    metadata: {
      count: recommendations.length,
      perfumeIds: recommendations.map((recommendation) => recommendation.perfumeId),
    },
  });
}
