import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseResultsParams } from "@/lib/results/params";
import { makeVector } from "@/tests/ai/fixtures";

/**
 * Batch 43 — the shared quiz → /result link builder.
 *
 * There are three places in the quiz that build a results URL. They must never
 * disagree about the attempt token, so they all call `buildResultsHref`, which
 * reads the token from its one owner (`getSessionToken` in flow-tracker). The
 * identity pin below is fixture-level: it proves the value written into the URL
 * is the very same string the attempt's QUIZ_STARTED carried, not a lookalike.
 */

const trackEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics/client", () => ({
  trackEvent: trackEventMock,
}));

/** jsdom-free sessionStorage stand-in, matching the flow-tracker suite. */
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

function parsedSession(href: string): string | null {
  const query = href.slice(href.indexOf("?") + 1);
  const parsed = parseResultsParams(Object.fromEntries(new URLSearchParams(query).entries()));

  expect(parsed.ok).toBe(true);
  return parsed.ok ? parsed.value.sessionId : "unreachable";
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  installSessionStorage();
});

describe("buildResultsHref — attempt token", () => {
  it("carries the exact token the attempt's QUIZ_STARTED carried", async () => {
    const tracker = await import("@/lib/analytics/flow-tracker");
    const { buildResultsHref } = await import("@/lib/results/href");

    tracker.trackQuizStarted("store-x");

    const startedToken = trackEventMock.mock.calls[0][0].sessionId as string;

    const href = buildResultsHref({
      vector: makeVector(),
      archetypeId: "romantic",
      storeId: "store-x",
    });

    expect(href.startsWith("/result?")).toBe(true);
    expect(startedToken).toBeTruthy();
    expect(parsedSession(href)).toBe(startedToken);
    // One token per attempt: building the link minted nothing new.
    expect(trackEventMock.mock.calls[0][0].sessionId).toBe(startedToken);
  });

  it("keeps the other params exactly as before alongside the token", async () => {
    const { buildResultsHref } = await import("@/lib/results/href");

    const href = buildResultsHref({
      vector: makeVector(),
      archetypeId: "romantic",
      storeId: "store-x",
      audience: "WOMEN",
    });

    const parsed = parseResultsParams(
      Object.fromEntries(new URLSearchParams(href.slice(href.indexOf("?") + 1)).entries()),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.storeId).toBe("store-x");
    expect(parsed.value.audience).toBe("WOMEN");
    expect(parsed.value.sessionId).toBeTruthy();
  });

  it("is the only results-link builder the three quiz call sites use", () => {
    for (const file of [
      "components/quiz/Quiz.tsx",
      "components/quiz/ContextStep.tsx",
      "components/quiz/FragranceProfileCard.tsx",
    ]) {
      const source = read(file);

      expect(source, `${file} must build its link through the shared builder`).toContain(
        "buildResultsHref(",
      );
      // Nobody hand-assembles a results query string any more.
      expect(source).not.toContain("serializeResultsParams(");
    }
  });

  it("threads the parsed token to the result-page click as well", () => {
    // The page hands the parsed value down; the card attaches it to the click
    // only when present (no `sessionId` key otherwise).
    expect(read("app/result/page.tsx")).toContain("sessionId={params.value.sessionId}");
    expect(read("components/results/ResultsView.tsx")).toContain("sessionId={sessionId}");
    expect(read("components/results/RecommendationCard.tsx")).toContain(
      "...(sessionId === null ? {} : { sessionId })",
    );
  });
});
