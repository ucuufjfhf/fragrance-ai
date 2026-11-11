"use client";

import { trackEvent } from "@/lib/analytics/client";
import { peekSessionToken } from "@/lib/analytics/flow-tracker";

/**
 * The widget's ONE perfume-click path (batch 40, session-aware since batch 44).
 *
 * The recommendation card and the head-to-head comparison both send the same
 * `PERFUME_CLICKED` event with the widget's store context — no new event type,
 * no second payload shape, and no analytics from the store-fallback link (the
 * merchant reads that visit through the UTM tags). Extracted so the comparison
 * cannot invent a different click behaviour — and so the attempt token is
 * attached in exactly one place.
 */
export function trackWidgetPerfumeClick(
  storeId: string,
  perfumeId: string,
): void {
  // Peek, never mint: a click belongs to the attempt that is already running.
  // No token → the payload is exactly the pre-batch shape.
  const sessionId = peekSessionToken();

  void trackEvent({
    eventType: "PERFUME_CLICKED",
    storeId,
    perfumeId,
    ...(sessionId === undefined ? {} : { sessionId }),
  });
}
