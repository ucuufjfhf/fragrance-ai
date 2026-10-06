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
