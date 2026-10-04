import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MVP grounding + AI-independence tests for the results layer.
 *
 * These cover the four properties the explanation layer must hold in
 * production:
 *  1. AI presence/absence cannot change perfume IDs, ranks, scores or order;
 *  2. a missing API key still returns the full deterministic Top 5;
 *  3. real perfume facts (family / notes / description) actually reach the
 *     Qwen prompt;
 *  4. one failed or timed-out explanation degrades to a missing explanation
 *     while the recommendation list stays complete.
 *
 * Only the DB and the network are mocked. The real `getResultsViewData`, the
 * real `buildExplanationInputs`, the real prompt builder and the real engine
 * input shape are exercised — the tests inspect the prompt handed to the
 * provider, so nothing here needs a live Qwen call.
 */

const mocks = vi.hoisted(() => ({
  getRecommendations: vi.fn(),
  generateExplanations: vi.fn(),
  selectUserTraits: vi.fn(),
  createAIProvider: vi.fn(),
  createControlledAIProvider: vi.fn(),
  recordAnalyticsEvent: vi.fn(),
}));

vi.mock("@/lib/matching/service", () => ({
  getRecommendations: mocks.getRecommendations,
}));

vi.mock("@/lib/ai/explanation", async (importOriginal) => {
  // Keep the REAL prompt builder and validators; only the network call is stubbed.
  const actual = await importOriginal<typeof import("@/lib/ai/explanation")>();
  return { ...actual, generateExplanations: mocks.generateExplanations };
});

vi.mock("@/lib/ai/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/provider")>();
  return { ...actual, createAIProvider: mocks.createAIProvider };
});

vi.mock("@/lib/ai/cost-controls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/cost-controls")>();
  return {
    ...actual,
    createControlledAIProvider: mocks.createControlledAIProvider,
  };
});

vi.mock("@/lib/analytics/service", () => ({
  recordAnalyticsEvent: mocks.recordAnalyticsEvent,
}));

import { buildExplanationUserPrompt } from "@/lib/ai/explanation";
import { getResultsViewData } from "@/lib/results/service";
import { parseResultsParams } from "@/lib/results/params";
import { PROFILE_AXES } from "@/lib/fragrance/profile";
import type { MatchedPerfume } from "@/types/recommendation";
import type { ResultsParams } from "@/lib/results/params";

const STORE = "store-real-merchant";

const baseInput = (): Record<string, string> =>
  Object.fromEntries(PROFILE_AXES.map((d) => [`v_${d}`, "50"]));

function paramsWith(extra: Record<string, string> = {}): ResultsParams {
  const parsed = parseResultsParams({
    ...baseInput(),
    archetype: "romantic",
    ...extra,
  });
  if (!parsed.ok) throw new Error(`invalid test params: ${parsed.reason}`);
  return parsed.value;
}

/** A ranked list with deliberately non-uniform scores so order is observable. */
function ranked(count: number): MatchedPerfume[] {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    perfumeId: `p-${i + 1}`,
    storeId: STORE,
    name: `Perfume ${i + 1}`,
    brand: `Brand ${i + 1}`,
    slug: null,
    productUrl: null,
    imageUrl: null,
    distance: i + 1,
    score: 95 - i,
    presentationScore: 95 - i,
  }));
}

/** Only the deterministic, AI-independent fields of a recommendation. */
function metadata(list: readonly MatchedPerfume[]) {
  return list.map((r) => ({
    perfumeId: r.perfumeId,
    rank: r.rank,
    score: r.score,
    presentationScore: r.presentationScore,
    distance: r.distance,
  }));
}

/** A provider that is available but whose explanation call always succeeds. */
function healthyProvider() {
  return {
    id: "qwen",
    isAvailable: () => true,
    unavailableReason: () => null,
    generatePerfumeProfile: vi.fn(),
    generateRecommendationExplanation: vi.fn(async (input) => ({
      perfumeId: input.recommendation.perfumeId,
      explanation:
        "این عطر با سلیقه تو هماهنگ است چون حس گرم و متعادلی دارد و برای استفاده روزانه مناسب به نظر می‌رسد.",
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRecommendations.mockResolvedValue({ recommendations: ranked(5), excluded: 0 });
  mocks.generateExplanations.mockResolvedValue(new Map<string, string>());
  mocks.createAIProvider.mockReturnValue(healthyProvider());
  mocks.createControlledAIProvider.mockImplementation(
    (provider: unknown) => provider,
  );
  mocks.recordAnalyticsEvent.mockResolvedValue(undefined);
});

describe("recommendation metadata is identical with and without AI", () => {
  it("returns the same ids, ranks, scores and order whether AI works or not", async () => {
    // 1. AI unavailable: the null-object provider makes every call fail.
    mocks.createAIProvider.mockReturnValue({
      id: "unavailable",
      isAvailable: () => false,
      unavailableReason: () => 'AI provider "qwen" is not configured: QWEN_API_KEY missing.',
      generatePerfumeProfile: vi.fn(),
      generateRecommendationExplanation: vi.fn(async () => {
        throw new Error("AI provider \"qwen\" is not configured: QWEN_API_KEY missing.");
      }),
    });
    mocks.generateExplanations.mockResolvedValue(new Map<string, string>());

    const withoutAi = await getResultsViewData(paramsWith({ store: STORE }));

    // 2. AI healthy and fully successful.
    mocks.createAIProvider.mockReturnValue(healthyProvider());
    mocks.generateExplanations.mockResolvedValue(
      new Map(ranked(5).map((r) => [r.perfumeId, `توضیح برای ${r.perfumeId}`])),
    );

    const withAi = await getResultsViewData(paramsWith({ store: STORE }));

    expect(withoutAi.aiAvailable).toBe(false);
    expect(withAi.aiAvailable).toBe(true);
    expect(withoutAi.explanations.size).toBe(0);
    expect(withAi.explanations.size).toBe(5);

    // The explanations differ; the recommendation metadata must not.
    expect(metadata(withAi.recommendations)).toEqual(metadata(withoutAi.recommendations));
    expect(metadata(withAi.recommendations)).toHaveLength(5);
  });

  it("does not re-sort or re-rank after explanations are attached", async () => {
    mocks.generateExplanations.mockResolvedValue(
      new Map(ranked(5).map((r) => [r.perfumeId, "یک توضیح فارسی کوتاه و طبیعی برای تو"])),
    );

    const data = await getResultsViewData(paramsWith({ store: STORE }));

    expect(data.recommendations.map((r) => r.perfumeId)).toEqual([
      "p-1",
      "p-2",
      "p-3",
      "p-4",
      "p-5",
    ]);
    expect(data.recommendations.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(data.recommendations.map((r) => r.score)).toEqual([95, 94, 93, 92, 91]);
  });
});

describe("a missing API key still returns recommendations", () => {
  it("returns the full Top 5 with unchanged scores and no explanations", async () => {
    mocks.createAIProvider.mockReturnValue({
      id: "unavailable",
      isAvailable: () => false,
      unavailableReason: () =>
        'AI provider "qwen" is not configured: QWEN_API_KEY missing.',
      generatePerfumeProfile: vi.fn(),
      generateRecommendationExplanation: vi.fn(async () => {
        throw new Error("no credentials");
      }),
    });
    mocks.generateExplanations.mockResolvedValue(new Map<string, string>());

    const data = await getResultsViewData(paramsWith({ store: STORE }));

    expect(data.isEmpty).toBe(false);
    expect(data.aiAvailable).toBe(false);
    expect(data.recommendations).toHaveLength(5);
    expect(data.explanations.size).toBe(0);

    // Scoring is completely untouched by the missing credential.
    expect(metadata(data.recommendations)).toEqual(metadata(ranked(5)));
  });

  it("still records the analytics events when AI is unavailable", async () => {
    mocks.createAIProvider.mockReturnValue({
      id: "unavailable",
      isAvailable: () => false,
      unavailableReason: () => "not configured",
      generatePerfumeProfile: vi.fn(),
      generateRecommendationExplanation: vi.fn(async () => {
        throw new Error("no credentials");
      }),
    });

    await getResultsViewData(paramsWith({ store: STORE }));

    const events = mocks.recordAnalyticsEvent.mock.calls.map(
      (call) => (call[0] as { eventType: string }).eventType,
    );
    expect(events).toContain("RESULT_VIEWED");
    expect(events).toContain("RECOMMENDATIONS_SHOWN");
  });
});

describe("grounding facts reach the Qwen prompt", () => {
  const FAMILY = "woody amber";
  const NOTES = ["cedar", "vanilla", "pepper"];
  const DESCRIPTION = "A warm woody fragrance with a dry spicy character.";

  it("passes family, notes and description into the generated prompt", async () => {
    const grounded: MatchedPerfume = {
      ...ranked(1)[0],
      description: DESCRIPTION,
      family: FAMILY,
      notes: NOTES,
    };
    mocks.getRecommendations.mockResolvedValue({
      recommendations: [grounded],
      excluded: 0,
    });

    // Capture the inputs the service hands to the explanation layer.
    let captured: Array<{
      perfume: { family?: string | null; notes?: string[] | null; description?: string | null };
    }> = [];
    mocks.generateExplanations.mockImplementation(async (_provider, inputs: unknown[]) => {
      captured = inputs as typeof captured;
      return new Map<string, string>();
    });

    await getResultsViewData(paramsWith({ store: STORE }));

    expect(captured).toHaveLength(1);
    expect(captured[0].perfume.family).toBe(FAMILY);
    expect(captured[0].perfume.notes).toEqual(NOTES);
    expect(captured[0].perfume.description).toBe(DESCRIPTION);

    // And the real prompt builder must actually render them.
    const prompt = buildExplanationUserPrompt({
      recommendation: grounded,
      archetypeLabel: "کاشف مرموز",
      perfume: {
        perfumeId: grounded.perfumeId,
        name: grounded.name,
        brand: grounded.brand,
        family: FAMILY,
        notes: NOTES,
        description: DESCRIPTION,
      },
      traits: [{ label: "گرم", value: 80 }],
    });

    expect(prompt).toContain(FAMILY);
    expect(prompt).toContain("cedar");
    expect(prompt).toContain("vanilla");
    expect(prompt).toContain("pepper");
    expect(prompt).toContain(DESCRIPTION);
    expect(prompt).not.toContain("(نامشخص)");
  });

  it("keeps the (نامشخص) fallback when the facts are genuinely absent", async () => {
    let captured: Array<{ perfume: { family?: string | null } }> = [];
    mocks.generateExplanations.mockImplementation(async (_provider, inputs: unknown[]) => {
      captured = inputs as typeof captured;
      return new Map<string, string>();
    });

    await getResultsViewData(paramsWith({ store: STORE }));

    expect(captured[0].perfume.family ?? null).toBeNull();

    const prompt = buildExplanationUserPrompt({
      recommendation: ranked(1)[0],
      archetypeLabel: "کاشف مرموز",
      perfume: {
        perfumeId: ranked(1)[0].perfumeId,
        name: ranked(1)[0].name,
        brand: ranked(1)[0].brand,
      },
      traits: [{ label: "گرم", value: 80 }],
    });

    // Missing facts are declared unknown, never invented.
    expect(prompt).toContain("(نامشخص)");
  });
});

describe("partial AI failure degrades per item", () => {
  /** The REAL loop — `generateExplanations` is module-mocked above, so the
   *  unmocked implementation is fetched explicitly rather than accidentally
   *  calling the stub (which would make every assertion below vacuous). */
  async function realGenerateExplanations() {
    const actual = await vi.importActual<
      typeof import("@/lib/ai/explanation")
    >("@/lib/ai/explanation");
    return actual.generateExplanations;
  }

  const inputsFor = () =>
    ranked(5).map((r) => ({
      recommendation: r,
      archetypeLabel: "کاشف مرموز",
      perfume: { perfumeId: r.perfumeId, name: r.name, brand: r.brand },
      traits: [{ label: "گرم", value: 80 }],
    }));

  it("keeps successes, drops the timed-out one and leaves the list complete", async () => {
    const provider = healthyProvider();
    provider.generateRecommendationExplanation = vi.fn(async (input) => {
      if (input.recommendation.perfumeId === "p-3") {
        throw new Error("AI request timed out after 15000ms.");
      }
      return {
        perfumeId: input.recommendation.perfumeId,
        explanation:
          "این عطر با سلیقه تو هماهنگ است چون حس متعادلی دارد و برای استفاده روزانه مناسب به نظر می‌رسد.",
      };
    });

    const generateExplanations = await realGenerateExplanations();
    const partial = await generateExplanations(provider, inputsFor());

    // 4 of 5 survive; only the timed-out item is absent — not an empty map.
    expect(partial.size).toBe(4);
    expect(partial.has("p-3")).toBe(false);
    expect(partial.get("p-1")).toBeTruthy();
    expect(partial.get("p-5")).toBeTruthy();

    mocks.createAIProvider.mockReturnValue(provider);
    mocks.generateExplanations.mockImplementation(() =>
      Promise.resolve(partial),
    );

    const data = await getResultsViewData(paramsWith({ store: STORE }));

    expect(data.explanations.size).toBe(4);
    expect(data.recommendations).toHaveLength(5);
    expect(metadata(data.recommendations)).toEqual(metadata(ranked(5)));
  });

  it("does not fail the whole page when every explanation fails", async () => {
    const provider = healthyProvider();
    provider.generateRecommendationExplanation = vi.fn(async () => {
      throw new Error("socket hang up");
    });

    const generateExplanations = await realGenerateExplanations();
    const none = await generateExplanations(provider, inputsFor());
    // A real attempt was made for every item, and all of them failed.
    expect(provider.generateRecommendationExplanation).toHaveBeenCalledTimes(5);
    expect(none.size).toBe(0);

    mocks.createAIProvider.mockReturnValue(provider);
    mocks.generateExplanations.mockResolvedValue(none);

    const data = await getResultsViewData(paramsWith({ store: STORE }));
    expect(data.isEmpty).toBe(false);
    expect(data.recommendations).toHaveLength(5);
    expect(metadata(data.recommendations)).toEqual(metadata(ranked(5)));
  });
});

describe("the results page uses the existing controlled provider", () => {
  it("wraps createAIProvider in createControlledAIProvider for the store", async () => {
    const inner = healthyProvider();
    const controlled = { ...inner, id: "controlled" };
    mocks.createAIProvider.mockReturnValue(inner);
    mocks.createControlledAIProvider.mockReturnValue(controlled);

    const data = await getResultsViewData(paramsWith({ store: STORE }));

    expect(mocks.createAIProvider).toHaveBeenCalledTimes(1);
    expect(mocks.createControlledAIProvider).toHaveBeenCalledTimes(1);
    // Same store id the widget route passes, so the limits are store-scoped.
    expect(mocks.createControlledAIProvider.mock.calls[0][1]).toBe(STORE);
    expect(mocks.createControlledAIProvider.mock.calls[0][0]).toBe(inner);
    expect(data.aiAvailable).toBe(true);
  });

  it("never constructs any provider at all in reference/demo mode", async () => {
    await getResultsViewData(paramsWith()); // storeless → REFERENCE_CATALOG

    expect(mocks.createAIProvider).not.toHaveBeenCalled();
    expect(mocks.createControlledAIProvider).not.toHaveBeenCalled();
    expect(mocks.generateExplanations).not.toHaveBeenCalled();
  });
});