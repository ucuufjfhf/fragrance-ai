"use client";

import type { AnalyticsEventType } from "@/lib/analytics/types";

/**
 * Browser-side event dispatcher (Phase 7).
 *
 * The ONLY thing a client component may import from `lib/analytics` — it is a
 * thin `fetch` wrapper with no Prisma, no secrets and no server modules. All
 * relationship validation happens server-side in `/api/events`; the browser is
 * never trusted.
 *
 * Fire-and-forget by design: a failed analytics call must never disturb the
 * customer flow that triggered it.
 */

const EVENTS_ENDPOINT = "/api/events";

/** Sends one event; resolves always, never throws. */
export async function trackEvent(payload: {
  eventType: AnalyticsEventType;
  storeId?: string;
  sessionId?: string;
  perfumeId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch(EVENTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Analytics must not hold the page's connection pool or affect unload.
      keepalive: true,
    });
  } catch {
    // Intentionally swallowed — see the module doc.
  }
}
