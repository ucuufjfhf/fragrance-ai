import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Results orchestration tests (mocked engine + AI layer — no DB, no network).
 *
 * The invariant under test: REFERENCE_CATALOG (demo) mode must make ZERO AI
 * explanation calls and must not even construct a provider, while
 * MERCHANT_INVENTORY keeps the existing Phase 4 behaviour unchanged.
 */

const mocks = vi.hoisted(() => ({
  getRecommendations: vi.fn(),
  generateExplanations: vi.fn(),
  selectUserTraits: vi.fn(),
  createAIProvider: vi.fn(),
  recordAnalyticsEvent: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/matching/service", () => ({
  getRecommendations: mocks.getRecommendations,
}));

vi.mock("@/lib/ai/explanation", () => ({
  generateExplanations: mocks.generateExplanations,
  selectUserTraits: mocks.selectUserTraits,
}));

vi.mock("@/lib/ai/provider", () => ({
  createAIProvider: mocks.createAIProvider,
}));

vi.mock("@/lib/analytics/service", () => ({
  recordAnalyticsEvent: mocks.recordAnalyticsEvent,
}));

// The two /result budgets are mocked; every policy value still comes from the
// real module, so the keys and caps under test are the shipped ones.
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, checkRateLimit: mocks.checkRateLimit };
});

import { getResultsViewData } from "@/lib/results/service";
import { parseResultsParams } from "@/lib/results/params";
import { PROFILE_AXES } from "@/lib/fragrance/profile";
import type { MatchedPerfume } from "@/types/recommendation";
import type { ResultsParams } from "@/lib/results/params";

const baseInput = (): Record<string, string> =>
  Object.fromEntries(PROFILE_AXES.map((d) => [`v_${d}`, "50"]));

function paramsWith(extra: Record<string, string> = {}): ResultsParams {
  const parsed = parseResultsParams({ ...baseInput(), archetype: "romantic", ...extra });
  if (!parsed.ok) throw new Error(`invalid test params: ${parsed.reason}`);
  return parsed.value;
}

const recommendation: MatchedPerfume = {
  rank: 1,
  perfumeId: "p-1",
  storeId: "store-real-merchant",
  name: "Test Perfume",
  brand: "Test Brand",
  slug: null,
  productUrl: null,
  imageUrl: null,
  distance: 1,
  score: 90,
  presentationScore: 90,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRecommendations.mockResolvedValue({ recommendations: [recommendation], excluded: 0 });
  mocks.generateExplanations.mockResolvedValue(new Map<string, string>([["p-1", "دلیل"]]));
  mocks.selectUserTraits.mockReturnValue([]);
  mocks.createAIProvider.mockReturnValue({
    id: "fake",
    isAvailable: () => true,
    unavailableReason: () => null,
  });
  mocks.recordAnalyticsEvent.mockResolvedValue(undefined);
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});

describe("getResultsViewData — reference-catalog mode never calls AI", () => {
  it("makes ZERO explanation calls and does not construct a provider", async () => {
    const data = await getResultsViewData(paramsWith()); // storeless → REFERENCE_CATALOG

    expect(data.isEmpty).toBe(false);
    expect(data.recommendations).toHaveLength(1);
    expect(data.aiAvailable).toBe(false);
    expect(data.explanations.size).toBe(0);

    // THE core guarantee: no paid explanation call, no provider construction.
    expect(mocks.generateExplanations).not.toHaveBeenCalled();
    expect(mocks.createAIProvider).not.toHaveBeenCalled();
  });

  it("still skips AI when REFERENCE_CATALOG is pinned explicitly over a store", async () => {
    const data = await getResultsViewData(
      paramsWith({ store: "store-real-merchant", source: "REFERENCE_CATALOG" }),
    );

    expect(data.aiAvailable).toBe(false);
    expect(mocks.generateExplanations).not.toHaveBeenCalled();
    expect(mocks.createAIProvider).not.toHaveBeenCalled();
  });

  it("returns an empty view without touching AI when the catalog has no match", async () => {
    mocks.getRecommendations.mockResolvedValue({ recommendations: [], excluded: 0 });

    const data = await getResultsViewData(paramsWith());

    expect(data.isEmpty).toBe(true);
    expect(data.aiAvailable).toBe(false);
    expect(mocks.generateExplanations).not.toHaveBeenCalled();
    expect(mocks.createAIProvider).not.toHaveBeenCalled();
  });
});

describe("getResultsViewData — merchant mode preserves AI explanations", () => {
  it("constructs a provider and generates explanations", async () => {
    const data = await getResultsViewData(paramsWith({ store: "store-real-merchant" }));

    expect(data.aiAvailable).toBe(true);
    expect(mocks.createAIProvider).toHaveBeenCalledTimes(1);
    expect(mocks.generateExplanations).toHaveBeenCalledTimes(1);
    expect(data.explanations.get("p-1")).toBe("دلیل");
  });
});

describe("audience threading (results params → matching service)", () => {
  it("passes the parsed audience through as targetGender", async () => {
    await getResultsViewData(
      paramsWith({ store: "store-real-merchant", target: "men" }),
    );

    expect(mocks.getRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-real-merchant",
        targetGender: "MEN",
      }),
    );
  });

  it("passes null (legacy, no filter) when the URL carries no audience", async () => {
    await getResultsViewData(paramsWith({ store: "store-real-merchant" }));

    expect(mocks.getRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ targetGender: null }),
    );
  });
});

describe("context threading (results params → matching service)", () => {
  it("passes the parsed season and occasion through as targetSeason/targetOccasion", async () => {
    await getResultsViewData(
      paramsWith({ store: "store-real-merchant", season: "summer", occasion: "date" }),
    );

    expect(mocks.getRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSeason: "SUMMER",
        targetOccasion: "DATE",
      }),
    );
  });

  it("passes null/null when the URL carries no context (legacy, no filter)", async () => {
    await getResultsViewData(paramsWith({ store: "store-real-merchant" }));

    expect(mocks.getRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ targetSeason: null, targetOccasion: null }),
    );
  });

  it("returns the empty view (no AI, no bypass) when the filtered inventory is empty", async () => {
    mocks.getRecommendations.mockResolvedValue({ recommendations: [], excluded: 7 });

    const data = await getResultsViewData(
      paramsWith({ store: "store-real-merchant", season: "winter", occasion: "formal" }),
    );

    expect(data.isEmpty).toBe(true);
    expect(data.recommendations).toEqual([]);
    expect(mocks.generateExplanations).not.toHaveBeenCalled();
  });
});

describe("merchant render throttle (buyer audit round 7)", () => {
  const REQUESTER = "198.51.100.7";

  it("records both funnel events and generates explanations when both budgets allow", async () => {
    const data = await getResultsViewData(
      paramsWith({ store: "store-real-merchant" }),
      undefined,
      REQUESTER,
    );

    expect(mocks.checkRateLimit.mock.calls).toEqual([
      ["result:requester:198.51.100.7", { limit: 30, windowMs: 60_000 }],
      ["result:store:store-real-merchant", { limit: 300, windowMs: 60_000 }],
    ]);
    expect(mocks.checkRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getRecommendations.mock.invocationCallOrder[0],
    );
    expect(mocks.createAIProvider).toHaveBeenCalledTimes(1);
    expect(mocks.generateExplanations).toHaveBeenCalledTimes(1);
    expect(data.explanations.get("p-1")).toBe("دلیل");
    expect(data.aiAvailable).toBe(true);
    expect(
      mocks.recordAnalyticsEvent.mock.calls.map((call) => call[0].eventType),
    ).toEqual(["RESULT_VIEWED", "RECOMMENDATIONS_SHOWN"]);
  });

  it("renders the deterministic results with no AI and no events when the requester is over budget", async () => {
    const logged = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 });

    const data = await getResultsViewData(
      paramsWith({ store: "store-real-merchant" }),
      undefined,
      REQUESTER,
    );

    // Same list, same archetype — only the paid copy and the funnel are gone.
    expect(data.recommendations).toHaveLength(1);
    expect(data.isEmpty).toBe(false);
    expect(data.aiAvailable).toBe(false);
    expect(data.explanations.size).toBe(0);
    expect(mocks.createAIProvider).not.toHaveBeenCalled();
    expect(mocks.generateExplanations).not.toHaveBeenCalled();
    expect(mocks.recordAnalyticsEvent).not.toHaveBeenCalled();
    // A denied requester never spends the store budget or loads inventory.
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.getRecommendations).not.toHaveBeenCalled();

    const entries = logged.mock.calls
      .map(([line]) => {
        try {
          return JSON.parse(String(line)) as {
            event?: string;
            storeId?: string;
            limit?: string;
            level?: string;
          };
        } catch {
          return null;
        }
      })
      .filter((entry) => entry?.event === "result_render_throttled");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "warn",
      storeId: "store-real-merchant",
      limit: "requester",
    });
    logged.mockRestore();
  });

  it("renders with no AI and no events when the store is over budget", async () => {
    mocks.checkRateLimit
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 12 });

    const data = await getResultsViewData(
      paramsWith({ store: "store-real-merchant" }),
      undefined,
      REQUESTER,
    );

    expect(data.recommendations).toHaveLength(1);
    expect(data.aiAvailable).toBe(false);
    expect(data.explanations.size).toBe(0);
    expect(mocks.createAIProvider).not.toHaveBeenCalled();
    expect(mocks.generateExplanations).not.toHaveBeenCalled();
    expect(mocks.recordAnalyticsEvent).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.checkRateLimit.mock.calls[1][0]).toBe(
      "result:store:store-real-merchant",
    );
  });

  it("does not record the empty-view event on a suppressed merchant render", async () => {
    mocks.getRecommendations.mockResolvedValue({ recommendations: [], excluded: 0 });
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 5 });

    const data = await getResultsViewData(
      paramsWith({ store: "store-real-merchant" }),
      undefined,
      REQUESTER,
    );

    expect(data.isEmpty).toBe(true);
    expect(data.recommendations).toEqual([]);
    expect(mocks.recordAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("never consults the limiter for a public (storeless) render", async () => {
    const data = await getResultsViewData(paramsWith(), undefined, REQUESTER);

    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(data.recommendations).toHaveLength(1);
    expect(mocks.recordAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("never consults the limiter for a pinned REFERENCE_CATALOG render with a store", async () => {
    await getResultsViewData(
      paramsWith({ store: "store-real-merchant", source: "REFERENCE_CATALOG" }),
      undefined,
      REQUESTER,
    );

    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.generateExplanations).not.toHaveBeenCalled();
  });

  it("leaves legacy callers without a requester id unthrottled", async () => {
    await getResultsViewData(paramsWith({ store: "store-real-merchant" }));

    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.generateExplanations).toHaveBeenCalledTimes(1);
    expect(mocks.recordAnalyticsEvent).toHaveBeenCalledTimes(2);
  });
});
