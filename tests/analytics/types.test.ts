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
  it("exposes exactly the six canonical event types", () => {
    // WIDGET_VIEWED is the funnel's first step (a widget was rendered); it is
    // added here and nowhere else, because this list is the contract.
    expect([...ANALYTICS_EVENT_TYPES]).toEqual([
      "QUIZ_STARTED",
      "QUIZ_COMPLETED",
      "RESULT_VIEWED",
      "RECOMMENDATIONS_SHOWN",
      "PERFUME_CLICKED",
      "WIDGET_VIEWED",
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

/**
 * `metadata.perfumeIds` — the per-perfume impression list on
 * RECOMMENDATIONS_SHOWN.
 *
 * The rule that matters here: the ids are ENRICHMENT, not identity. A malformed
 * list is dropped and the event is still accepted, because losing the count to
 * protect the list would cost the merchant the very number this feature exists
 * to surface. Ownership is the service's DB check, not this pure boundary.
 */
describe("validateAnalyticsEvent — perfumeIds enrichment", () => {
  const shown = (perfumeIds: unknown) => ({
    eventType: "RECOMMENDATIONS_SHOWN",
    storeId: "store-1",
    metadata: { count: 3, perfumeIds },
  });

  it("accepts up to three id-shaped strings and preserves display order", () => {
    const result = validateAnalyticsEvent(shown(["perfume-c", "perfume-a", "perfume-b"]));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.metadata?.perfumeIds).toEqual(["perfume-c", "perfume-a", "perfume-b"]);
      // The count field is untouched by the enrichment.
      expect(result.value.metadata?.count).toBe(3);
    }
  });

  it("strips an oversized list instead of rejecting the event", () => {
    const result = validateAnalyticsEvent(shown(["p1", "p2", "p3", "p4"]));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.metadata?.perfumeIds).toBeUndefined();
      expect(result.value.metadata?.count).toBe(3);
    }
  });

  it("strips malformed entries (empty, non-string, bad characters, too long)", () => {
    const malformed: unknown[] = [
      [""],
      [42],
      ["bad id!"],
      ["x".repeat(65)],
      ["p1", null],
    ];

    for (const ids of malformed) {
      const result = validateAnalyticsEvent(shown(ids));

      expect(result.ok, `payload was rejected for ids ${JSON.stringify(ids)}`).toBe(true);

      if (result.ok) {
        expect(result.value.metadata?.perfumeIds).toBeUndefined();
      }
    }
  });

  it("strips a non-array value (string, object, empty array)", () => {
    for (const ids of ["perfume-a", { 0: "perfume-a" }, []]) {
      const result = validateAnalyticsEvent(shown(ids));

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.value.metadata?.perfumeIds).toBeUndefined();
      }
    }
  });

  it("does not let a huge malformed list push the count past the byte limit", () => {
    // 200 junk ids would blow the metadata budget on their own; stripping first
    // means the small, valid `count` still lands.
    const result = validateAnalyticsEvent(shown(Array.from({ length: 200 }, (_, index) => `!!${index}`)));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.metadata).toEqual({ count: 3 });
    }
  });

  it("leaves metadata untouched when perfumeIds is absent", () => {
    const result = validateAnalyticsEvent({
      eventType: "RECOMMENDATIONS_SHOWN",
      storeId: "store-1",
      metadata: { count: 3 },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.metadata).toEqual({ count: 3 });
    }
  });
});
