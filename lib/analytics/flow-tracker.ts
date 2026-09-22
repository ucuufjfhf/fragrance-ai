"use client";

import { trackEvent } from "@/lib/analytics/client";
import type { AnalyticsEventType } from "@/lib/analytics/types";

/**
 * Pure lifecycle helpers for the customer-flow integration (Phase 7, §12).
 *
 * React components re-render freely, so events tied to "a page was viewed"
 * must fire exactly once per quiz attempt — not once per render. This module
 * keeps that state OUT of React: a module-level guard keyed by the attempt's
 * opaque session token makes each tracker idempotent at the UI lifecycle level.
 *
 * `sessionstorage` persistence means a full page reload of /result (F5) does
 * not double-count RESULT_VIEWED, while a genuinely new quiz attempt (new
 * token) does record a fresh event. No PII is stored — the token is a random
 * opaque string and only lives in the visitor's own browser storage.
 */

const SESSION_STORAGE_KEY = "fragrance-ai:analytics-session";
const fired = new Set<AnalyticsEventType>();

/** Random opaque token for one anonymous quiz attempt. No user identity. */
function createSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Ancient-browser fallback (still random, still opaque).
  return `s-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Returns the attempt token, creating + persisting one when absent. */
function getSessionToken(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

    if (existing) {
      return existing;
    }

    const created = createSessionToken();

    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);

    return created;
  } catch {
    // Storage can be disabled (private mode) — the event still fires, just
    // without a correlatable token.
    return createSessionToken();
  }
}

/**
 * Drops the current attempt token and clears the once-guards. Called when a
 * NEW quiz attempt begins so its QUIZ_STARTED / RESULT_VIEWED fire again.
 */
export function resetAnalyticsFlow(): void {
  fired.clear();

  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore — nothing to reset.
  }
}

/** Fires `eventType` at most once per attempt. Returns whether it fired. */
function fireOnce(eventType: AnalyticsEventType, payload: Record<string, unknown>): boolean {
  if (fired.has(eventType)) {
    return false;
  }

  fired.add(eventType);
  void trackEvent({ eventType, ...payload } as Parameters<typeof trackEvent>[0]);

  return true;
}

/** QUIZ_STARTED — when the shopper actually enters the quiz (intro → Q1). */
export function trackQuizStarted(storeId?: string): void {
  fireOnce("QUIZ_STARTED", { storeId, sessionId: getSessionToken() });
}

/** QUIZ_COMPLETED — a valid personality vector exists (API or offline path). */
export function trackQuizCompleted(storeId?: string): void {
  fireOnce("QUIZ_COMPLETED", { storeId, sessionId: getSessionToken() });
}

/**
 * RESULT_VIEWED — the results screen rendered for a valid profile. The
 * sessionStorage token means an F5 refresh of /result is the same attempt and
 * does not double-count.
 */
export function trackResultViewed(storeId?: string): void {
  fireOnce("RESULT_VIEWED", { storeId, sessionId: getSessionToken() });
}
