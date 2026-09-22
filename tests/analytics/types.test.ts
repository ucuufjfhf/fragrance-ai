import { describe, expect, it } from "vitest";

import {
  ANALYTICS_EVENT_TYPES,
  validateAnalyticsEvent,
} from "@/lib/analytics/types";

/**
 * Pure tests for the Phase 7 event contract (spec §26, event contract).
 * No database — untrusted payloads in, accept/reject out.
 */

const VALID = {
  eventType: "QUIZ_STARTED",
  storeId: "store-1",
  sessionId: "session-abc",
};

describe("validateAnalyticsEvent — contract membership (§5)", () => {
  it("exposes exactly the five canonical event types", () => {
    expect([...ANALYTICS_EVENT_TYPES]).toEqual([
      "QUIZ_STARTED",
      "QUIZ_COMPLETED",
      "RESULT_VIEWED",
      "RECOMMENDATIONS_SHOWN",
      "PERFUME_CLICKED",
    ]);
  });

  it("accepts every canonical event type with valid ids", () => {
    for (const eventType of ANALYTICS_EVENT_TYPES) {
      const result = validateAnalyticsEvent({ ...VALID, eventType });

      expect(result.ok).toBe(true);
    }
  });

  it("rejects an unknown event type", () => {
    const result = validateAnalyticsEvent({ ...VALID, eventType: "PAGE_VIEW" });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toContain("eventType");
    }
  });

  it("rejects a lowercase / mangled event type", () => {
    expect(validateAnalyticsEvent({ ...VALID, eventType: "quiz_started" }).ok).toBe(false);
  });
});

describe("validateAnalyticsEvent — payload shape (§11)", () => {
  it("rejects non-object payloads", () => {
    expect(validateAnalyticsEvent(null).ok).toBe(false);
    expect(validateAnalyticsEvent("event").ok).toBe(false);
    expect(validateAnalyticsEvent(42).ok).toBe(false);
    expect(validateAnalyticsEvent([]).ok).toBe(false);
  });

  it("rejects malformed ids", () => {
    expect(validateAnalyticsEvent({ eventType: "QUIZ_STARTED", storeId: "" }).ok).toBe(false);
    expect(validateAnalyticsEvent({ eventType: "QUIZ_STARTED", storeId: 123 }).ok).toBe(false);
    expect(validateAnalyticsEvent({ eventType: "QUIZ_STARTED", sessionId: "bad id!" }).ok).toBe(false);
    expect(validateAnalyticsEvent({ eventType: "QUIZ_STARTED", perfumeId: "x".repeat(65) }).ok).toBe(false);
  });

  it("accepts well-formed opaque ids", () => {
    const result = validateAnalyticsEvent({
      eventType: "PERFUME_CLICKED",
      storeId: "store-demo-perfume-shop",
      sessionId: "s-1737500000000-abc123",
      perfumeId: "perfume-demo-fresh",
    });

    expect(result.ok).toBe(true);
  });

  it("accepts absent optional fields", () => {
    const result = validateAnalyticsEvent({ eventType: "QUIZ_STARTED" });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.storeId).toBeUndefined();
      expect(result.value.sessionId).toBeUndefined();
      expect(result.value.perfumeId).toBeUndefined();
      expect(result.value.metadata).toBeUndefined();
    }
  });

  it("rejects non-object metadata", () => {
    expect(validateAnalyticsEvent({ eventType: "QUIZ_STARTED", metadata: "count" }).ok).toBe(false);
    expect(validateAnalyticsEvent({ eventType: "QUIZ_STARTED", metadata: [1, 2] }).ok).toBe(false);
  });

  it("rejects oversized metadata (analytics is not a data store, §11)", () => {
    const bloated: Record<string, unknown> = {};

    for (let index = 0; index < 100; index += 1) {
      bloated[`key${index}`] = "x".repeat(20);
    }

    const result = validateAnalyticsEvent({ eventType: "QUIZ_STARTED", metadata: bloated });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toContain("size limit");
    }
  });

  it("accepts small valid metadata", () => {
    const result = validateAnalyticsEvent({
      eventType: "RECOMMENDATIONS_SHOWN",
      storeId: "store-1",
      metadata: { count: 4 },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.metadata).toEqual({ count: 4 });
    }
  });
});
