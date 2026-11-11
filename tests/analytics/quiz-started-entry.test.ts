import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateAnalyticsEvent } from "@/lib/analytics/types";

/**
 * Batch 46 — the QUIZ_STARTED entry marker.
 *
 * The homepage hero answers Q1 itself (batch 38) and resumes the quiz, firing
 * the attempt's single QUIZ_STARTED on arrival. Nothing said which entry
 * produced it, so the hero's effect on completion was unmeasurable. The marker
 * rides in `metadata.entry` — the contract's existing optional object — only
 * when the caller passes "hero"; every other start keeps the previous payload
 * exactly, with no `metadata` key at all.
 */

const trackEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics/client", () => ({
  trackEvent: trackEventMock,
}));

/** jsdom-free sessionStorage stand-in, same as the rest of the analytics suite. */
function installSessionStorage(): void {
  const store = new Map<string, string>();

  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    crypto: undefined,
  });
}

const read = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const QUIZ_SOURCE = read("components/quiz/Quiz.tsx");
const WIDGET_SOURCE = read("components/widget/WidgetApp.tsx");

const STARTED = (): Array<Record<string, unknown>> =>
  trackEventMock.mock.calls
    .map(([payload]) => payload as Record<string, unknown>)
    .filter((payload) => payload.eventType === "QUIZ_STARTED");

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  installSessionStorage();
});

describe("trackQuizStarted — the hero marker", () => {
  it("adds exactly metadata.entry=hero when the hero entry is passed", async () => {
    const tracker = await import("@/lib/analytics/flow-tracker");

    tracker.trackQuizStarted("store-x", "hero");

    const [payload] = STARTED();

    expect(Object.keys(payload).sort()).toEqual([
      "eventType",
      "metadata",
      "sessionId",
      "storeId",
    ]);
    expect(payload.metadata).toEqual({ entry: "hero" });
    expect(payload.storeId).toBe("store-x");
    expect(typeof payload.sessionId).toBe("string");
  });

  it("keeps the payload byte-identical without the marker", async () => {
    const tracker = await import("@/lib/analytics/flow-tracker");

    tracker.trackQuizStarted("store-x");

    const [payload] = STARTED();

    expect(Object.keys(payload).sort()).toEqual([
      "eventType",
      "sessionId",
      "storeId",
    ]);
    // The key is absent, not undefined/null/{}.
    expect("metadata" in payload).toBe(false);
  });

  it("is a per-call argument — nothing about the entry is persisted", async () => {
    const tracker = await import("@/lib/analytics/flow-tracker");

    // A hero attempt fires with the marker...
    tracker.trackQuizStarted("store-x", "hero");
    // ...then a later, separate module state starts fresh without it.
    vi.resetModules();
    const fresh = await import("@/lib/analytics/flow-tracker");
    fresh.trackQuizStarted("store-x");

    const payloads = STARTED();

    expect(payloads).toHaveLength(2);
    expect(payloads[0].metadata).toEqual({ entry: "hero" });
    expect("metadata" in payloads[1]).toBe(false);
  });
});

describe("quiz started marker — contract and persistence", () => {
  it("passes validation and survives to the writer", async () => {
    const tracker = await import("@/lib/analytics/flow-tracker");

    tracker.trackQuizStarted("store-x", "hero");

    const [payload] = STARTED();
    const validation = validateAnalyticsEvent(payload);

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.value.metadata).toEqual({ entry: "hero" });
    expect(validation.value.sessionId).toBe(payload.sessionId);

    // The repository persists metadata as JSON and sessionId as its own column.
    expect(read("lib/analytics/repository.ts")).toContain("input.metadata");
    expect(read("lib/analytics/repository.ts")).toContain("input.sessionId");
  });

  it("is well inside the metadata budget", () => {
    const serialized = JSON.stringify({ entry: "hero" });

    expect(serialized.length).toBeLessThan(64);
  });
});

describe("quiz started marker — only the hero call site passes it", () => {
  it("marks the resumed entry and leaves the intro button bare", () => {
    // Exactly two call sites: the carried-answer effect marks "hero", the intro
    // button passes only the store.
    expect(QUIZ_SOURCE.match(/trackQuizStarted\(storeId, "hero"\)/g) ?? []).toHaveLength(1);
    expect(QUIZ_SOURCE.match(/trackQuizStarted\(storeId\)/g) ?? []).toHaveLength(1);
    // No third form exists: the only marked call is the one above.
    expect(QUIZ_SOURCE.match(/trackQuizStarted\(/g) ?? []).toHaveLength(2);
  });

  it("never marks the widget's own quiz start", () => {
    expect(WIDGET_SOURCE).toContain("trackQuizStarted(storeId)");
    expect(WIDGET_SOURCE).not.toContain('"hero"');
  });
});
