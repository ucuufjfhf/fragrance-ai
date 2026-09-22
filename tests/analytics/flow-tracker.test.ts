import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 7 flow-tracker tests (spec §12/§26, event integration) — the client
 * fetch layer is mocked, so no network and no server. Verifies the UI
 * lifecycle dedupe: once-per-attempt events cannot fire per render, clicks
 * always fire, and a reset starts a new attempt.
 */

const trackEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics/client", () => ({
  trackEvent: trackEventMock,
}));

/** A minimal sessionStorage stand-in (jsdom-free node env). */
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

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  installSessionStorage();
});

async function loadTracker() {
  return import("@/lib/analytics/flow-tracker");
}

describe("flow-tracker — once-per-attempt semantics (§12)", () => {
  it("fires QUIZ_STARTED exactly once even across repeated calls (rerenders)", async () => {
    const tracker = await loadTracker();

    tracker.trackQuizStarted();
    tracker.trackQuizStarted();
    tracker.trackQuizStarted();

    const started = trackEventMock.mock.calls.filter(
      ([payload]) => payload.eventType === "QUIZ_STARTED",
    );

    expect(started).toHaveLength(1);
  });

  it("fires QUIZ_COMPLETED once per attempt", async () => {
    const tracker = await loadTracker();

    tracker.trackQuizCompleted();
    tracker.trackQuizCompleted();

    const completed = trackEventMock.mock.calls.filter(
      ([payload]) => payload.eventType === "QUIZ_COMPLETED",
    );

    expect(completed).toHaveLength(1);
  });

  it("resetAnalyticsFlow starts a new attempt: the events fire again", async () => {
    const tracker = await loadTracker();

    tracker.trackQuizStarted();
    tracker.resetAnalyticsFlow();
    tracker.trackQuizStarted();

    const started = trackEventMock.mock.calls.filter(
      ([payload]) => payload.eventType === "QUIZ_STARTED",
    );

    expect(started).toHaveLength(2);
  });

  it("issues a NEW session token after a reset (new anonymous attempt)", async () => {
    const tracker = await loadTracker();

    tracker.trackQuizStarted();
    const firstToken = trackEventMock.mock.calls[0][0].sessionId;

    tracker.resetAnalyticsFlow();
    tracker.trackQuizStarted();
    const secondToken = trackEventMock.mock.calls[1][0].sessionId;

    expect(secondToken).not.toBe(firstToken);
  });

  it("reuses the persisted token within one attempt (RESULT_VIEWED dedupe)", async () => {
    const tracker = await loadTracker();

    tracker.trackResultViewed();
    tracker.trackResultViewed();

    const viewed = trackEventMock.mock.calls.filter(
      ([payload]) => payload.eventType === "RESULT_VIEWED",
    );

    expect(viewed).toHaveLength(1);
    expect(viewed[0][0].sessionId).toBeTruthy();
  });

  it("still fires (without persistence) when sessionStorage throws", async () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("disabled");
        },
        setItem: () => {
          throw new Error("disabled");
        },
        removeItem: () => {
          throw new Error("disabled");
        },
      },
    });

    const tracker = await loadTracker();

    expect(() => tracker.trackQuizStarted()).not.toThrow();
    expect(trackEventMock).toHaveBeenCalledTimes(1);
  });
});

describe("flow-tracker — payload hygiene (§7/§25)", () => {
  it("sends only the contract fields — no PII, no fingerprint", async () => {
    const tracker = await loadTracker();

    tracker.trackQuizStarted("store-1");

    const payload = trackEventMock.mock.calls[0][0];

    expect(Object.keys(payload).sort()).toEqual(["eventType", "sessionId", "storeId"]);
  });

  it("the session token is an opaque random string", async () => {
    const tracker = await loadTracker();

    tracker.trackQuizStarted();

    const token = trackEventMock.mock.calls[0][0].sessionId as string;

    expect(token).toMatch(/^[a-zA-Z0-9-]{10,64}$/);
  });
});
