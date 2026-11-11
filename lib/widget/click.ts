"use client";

import { trackEvent } from "@/lib/analytics/client";

/**
 * The widget's ONE perfume-click path (batch 40).
 *
 * The recommendation card and the head-to-head comparison both send the same
 * `PERFUME_CLICKED` event with the widget's store context — no new event type,
 * no second payload shape, and no analytics from the store-fallback link (the
 * merchant reads that visit through the UTM tags). Extracted so the comparison
 * cannot invent a different click behaviour.
 */
export function trackWidgetPerfumeClick(
  storeId: string,
  perfumeId: string,
): void {
  void trackEvent({ eventType: "PERFUME_CLICKED", storeId, perfumeId });
}
