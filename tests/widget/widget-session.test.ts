import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateAnalyticsEvent } from "@/lib/analytics/types";
import type { WidgetRecommendation } from "@/lib/widget/contract";

/**
 * Batch 44 — the attempt token on the widget's result and click events.
 *
 * The widget surfaces the result inside the merchant's iframe, and its quiz half
 * already carried the attempt token (QUIZ_STARTED/QUIZ_COMPLETED). These pins
 * close the other half: RESULT_VIEWED, RECOMMENDATIONS_SHOWN and PERFUME_CLICKED
 * attach that SAME token when the attempt has one, and are byte-identical to the
 * pre-batch payload when it does not. The rule under test is peek, never mint:
 * a token minted at result time would name an attempt that never started.
 */

const trackEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics/client", () => ({
  trackEvent: trackEventMock,
}));

/** jsdom-free sessionStorage stand-in, same shape as the flow-tracker suite. */
function installSessionStorage(): Map<string, string> {
  const store = new Map<string, string>();

  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    crypto: undefined,
  });

  return store;
}

let storage: Map<string, string>;

const RECS: WidgetRecommendation[] = [
  {
    perfumeId: "p-1",
    rank: 1,
    name: "عطر یک",
    brand: "برند یک",
    productUrl: "https://shop.example/p/1",
    imageUrl: null,
    price: 1_250_000,
    matchPercent: 91.4,
  },
  {
    perfumeId: "p-2",
    rank: 2,
    name: "عطر دو",
    brand: "برند دو",
    productUrl: null,
    imageUrl: null,
    price: null,
    matchPercent: 78.2,
  },
];

const read = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

async function loadWidgetModules() {
  const tracker = await import("@/lib/analytics/flow-tracker");
  const events = await import("@/lib/widget/events");
  const click = await import("@/lib/widget/click");

  return { tracker, events, click };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  storage = installSessionStorage();
});

describe("widget funnel — attempt token attached with peek semantics", () => {
  it("uses the exact token the attempt's QUIZ_COMPLETED carried", async () => {
    const { tracker, events, click } = await loadWidgetModules();

    tracker.trackQuizCompleted("store-x");

    const attemptToken = trackEventMock.mock.calls[0][0].sessionId as string;
    expect(attemptToken).toBeTruthy();

    trackEventMock.mockClear();

    events.trackWidgetResultEvents("store-x", RECS);
    click.trackWidgetPerfumeClick("store-x", "p-1");

    const [viewed, shown, clicked] = trackEventMock.mock.calls.map(([payload]) => payload);

    expect(viewed.sessionId).toBe(attemptToken);
    expect(shown.sessionId).toBe(attemptToken);
    expect(clicked.sessionId).toBe(attemptToken);
  });

  it("keeps both result payloads' existing parts untouched", async () => {
    const { tracker, events } = await loadWidgetModules();

    tracker.trackQuizCompleted("store-x");
    trackEventMock.mockClear();

    events.trackWidgetResultEvents("store-x", RECS);

    const [viewed, shown] = trackEventMock.mock.calls.map(([payload]) => payload);

    expect(viewed).toMatchObject({ eventType: "RESULT_VIEWED", storeId: "store-x" });
    expect(shown).toMatchObject({
      eventType: "RECOMMENDATIONS_SHOWN",
      storeId: "store-x",
      metadata: { count: 2, perfumeIds: ["p-1", "p-2"] },
    });
  });

  it("is byte-identical to the pre-batch shapes when there is no attempt", async () => {
    const { events, click } = await loadWidgetModules();

    events.trackWidgetResultEvents("store-x", RECS);
    click.trackWidgetPerfumeClick("store-x", "p-1");

    const [viewed, shown, clicked] = trackEventMock.mock.calls.map(([payload]) => payload);

    // No `sessionId` key at all — not undefined, not null, not a fresh id.
    expect(Object.keys(viewed).sort()).toEqual(["eventType", "storeId"]);
    expect(Object.keys(shown).sort()).toEqual(["eventType", "metadata", "storeId"]);
    expect(Object.keys(clicked).sort()).toEqual(["eventType", "perfumeId", "storeId"]);
    expect(shown.metadata).toEqual({ count: 2, perfumeIds: ["p-1", "p-2"] });
  });

  it("never mints a token at result or click time", async () => {
    const { events, click } = await loadWidgetModules();

    events.trackWidgetResultEvents("store-x", RECS);
    click.trackWidgetPerfumeClick("store-x", "p-1");

    // Peek semantics: an empty storage stays empty, so no attempt is fabricated.
    expect(storage.size).toBe(0);
    for (const [payload] of trackEventMock.mock.calls) {
      expect("sessionId" in payload).toBe(false);
    }
  });
});

describe("widget funnel — peek/getter discipline at the source level", () => {
  const WIDGET_APP = read("components/widget/WidgetApp.tsx");
  const CLICK = read("lib/widget/click.ts");
  const EVENTS = read("lib/widget/events.ts");

  it("routes both result events through the one helper", () => {
    expect(WIDGET_APP).toContain("trackWidgetResultEvents(storeId, data.recommendations)");
    // The events are no longer dispatched inline with a bare payload.
    expect(WIDGET_APP).not.toContain('eventType: "RESULT_VIEWED"');
    expect(WIDGET_APP).not.toContain('eventType: "RECOMMENDATIONS_SHOWN"');
  });

  it("peeks in both widget event paths and never mints anywhere in the widget", () => {
    for (const [name, source] of [
      ["lib/widget/events.ts", EVENTS],
      ["lib/widget/click.ts", CLICK],
    ] as const) {
      expect(source, `${name} must peek`).toContain("peekSessionToken");
    }

    // WidgetApp delegates the peek to the result helper and never mints itself.
    for (const source of [EVENTS, CLICK, WIDGET_APP]) {
      expect(source).not.toContain("getSessionToken(");
    }
    expect(WIDGET_APP).toContain("trackWidgetResultEvents(");
  });

  it("keeps one click path for both the card and the comparison block", () => {
    const card = read("components/widget/WidgetRecommendationCard.tsx");
    const comparison = read("components/widget/WidgetHeadToHead.tsx");

    for (const source of [card, comparison]) {
      expect(source).toContain("trackWidgetPerfumeClick(");
      expect(source).not.toContain('eventType: "PERFUME_CLICKED"');
    }
  });
});

describe("widget funnel — the receiving path keeps the token", () => {
  it("accepts and preserves sessionId for all three widget event types", () => {
    const token = "s-1737500000000-abc123";

    for (const eventType of [
      "RESULT_VIEWED",
      "RECOMMENDATIONS_SHOWN",
      "PERFUME_CLICKED",
    ] as const) {
      const validation = validateAnalyticsEvent({
        eventType,
        storeId: "store-x",
        sessionId: token,
        metadata: { count: 1, perfumeIds: ["p-1"] },
      });

      expect(validation.ok).toBe(true);
      if (!validation.ok) return;
      expect(validation.value.sessionId).toBe(token);
    }
  });

  it("persists it through the writer and hands the route the raw payload", () => {
    expect(read("lib/analytics/repository.ts")).toContain("sessionId: input.sessionId");
    expect(read("app/api/events/route.ts")).toContain("recordAnalyticsEvent(payload)");
  });
});
