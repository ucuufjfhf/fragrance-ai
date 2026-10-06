import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EXPLANATION_CACHE_MAX_ENTRIES,
  EXPLANATION_CACHE_TTL_MS,
  explanationCacheKey,
  explanationCacheSizeForTests,
  generateExplanations,
  resetExplanationCacheForTests,
} from "@/lib/ai/explanation";
import { matchPerfumes } from "@/lib/matching/engine";
import type { AIProvider, AiExplanationInput } from "@/lib/ai/provider";
import {
  makeExplanationInput,
  makeMatchResult,
  makeVector,
  shiftedProfile,
  TEST_PERFUME_ID,
  TEST_STORE_ID,
} from "./fixtures";

/**
 * Focused cache tests for the in-process, prompt-hash explanation cache.
 *
 * Fully offline: every provider here is an in-memory fake that counts its
 * calls, so no GapGPT/Qwen request is ever made, no credential is read and no
 * AI credit is spent. Fixture inputs are digit-free by convention; the tags
 * used to build distinct perfumes are Persian letters.
 */

const TEXT_A =
  "این عطر با سلیقه گرم و مرموز تو هماهنگه و همون حس خاصی که دنبالش هستی رو منتقل می‌کنه.";
const TEXT_B =
  "رایحه گرم و چوبی این عطر به شخصیت جسورانه تو نزدیکه و برای شبهای خاص انتخاب بسیار دلنشینیه.";

/**
 * Distinct Persian-letter tags (no digits) so every generated input renders a
 * different prompt — used to build multi-item batches and to fill the cache.
 */
const LETTERS = "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی";
function tag(index: number): string {
  let value = index;
  let out = "";
  do {
    out = LETTERS[value % LETTERS.length] + out;
    value = Math.floor(value / LETTERS.length) - 1;
  } while (value >= 0);
  return out;
}

// Guards the injectivity assumption Test 8 relies on: a duplicated letter in
// LETTERS would make two "distinct" tags share one prompt (and one cache key).
it("produces unique tags", () => {
  expect(new Set(LETTERS).size).toBe(LETTERS.length);
  const tags = Array.from({ length: 600 }, (_, i) => tag(i));
  expect(new Set(tags).size).toBe(tags.length);
});

/** A distinct explanation input: different perfume name → different prompt. */
function inputTagged(t: string): AiExplanationInput {
  const base = makeExplanationInput();
  return {
    ...base,
    recommendation: {
      ...base.recommendation,
      perfumeId: `perfume-${t}`,
      name: `عطر ${t}`,
    },
    perfume: {
      ...base.perfume,
      perfumeId: `perfume-${t}`,
      name: `عطر ${t}`,
    },
  };
}

/**
 * Offline provider that records every call. `respond` decides the (valid,
 * Persian, digit-free) explanation text — or throws to simulate provider
 * failures.
 */
function countingProvider(
  respond: (input: AiExplanationInput, callIndex: number) => string,
): { provider: AIProvider; calls: AiExplanationInput[] } {
  const calls: AiExplanationInput[] = [];

  const provider: AIProvider = {
    id: "test-cache",
    isAvailable: () => true,
    unavailableReason: () => null,
    generatePerfumeProfile: async () => {
      throw new Error("not used in this suite");
    },
    generateRecommendationExplanation: async (input) => {
      const callIndex = calls.length;
      calls.push(input);
      const explanation = respond(input, callIndex);
      return {
        perfumeId: input.recommendation.perfumeId,
        explanation,
      };
    },
  };

  return { provider, calls };
}

beforeEach(() => {
  resetExplanationCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
  resetExplanationCacheForTests();
});

describe("explanation cache key", () => {
  it("is stable for identical inputs and rotates on any prompt input change", () => {
    const base = makeExplanationInput();

    expect(explanationCacheKey(base)).toBe(
      explanationCacheKey(makeExplanationInput()),
    );

    // archetype label change → new key
    expect(
      explanationCacheKey({ ...base, archetypeLabel: "کاشف شجاع" }),
    ).not.toBe(explanationCacheKey(base));

    // trait band change → new key
    expect(
      explanationCacheKey({ ...base, traits: [{ label: "مرموز", value: 90 }] }),
    ).not.toBe(explanationCacheKey(base));

    // perfume fact change → new key
    expect(
      explanationCacheKey({
        ...base,
        perfume: { ...base.perfume, description: "عطری تازه و سبک برای روز" },
      }),
    ).not.toBe(explanationCacheKey(base));
  });
});

describe("Test 1 — first request", () => {
  it("calls the provider once and returns the explanation on an empty cache", async () => {
    const { provider, calls } = countingProvider(() => TEXT_A);
    const input = makeExplanationInput();

    const explanations = await generateExplanations(provider, [input]);

    expect(calls).toHaveLength(1);
    expect(explanations.get(input.recommendation.perfumeId)).toBe(TEXT_A);
  });
});

describe("Test 2 — identical second request", () => {
  it("makes no further provider call and returns the identical explanation", async () => {
    const { provider, calls } = countingProvider(() => TEXT_A);
    const input = makeExplanationInput();

    const first = await generateExplanations(provider, [input]);
    const second = await generateExplanations(provider, [input]);

    expect(calls).toHaveLength(1);
    expect(second).toEqual(first);
    expect(second.get(input.recommendation.perfumeId)).toBe(TEXT_A);
  });
});

describe("Test 3 — different user profile", () => {
  it("misses the cache for a different archetype and does not reuse its copy", async () => {
    const { provider, calls } = countingProvider((_input, callIndex) =>
      callIndex === 0 ? TEXT_A : TEXT_B,
    );

    const profileOne = makeExplanationInput();
    const profileTwo = makeExplanationInput({ archetypeLabel: "کاشف شجاع" });

    const first = await generateExplanations(provider, [profileOne]);
    const second = await generateExplanations(provider, [profileTwo]);

    expect(calls).toHaveLength(2);
    expect(first.get(profileOne.recommendation.perfumeId)).toBe(TEXT_A);
    expect(second.get(profileTwo.recommendation.perfumeId)).toBe(TEXT_B);
    expect(second.get(profileTwo.recommendation.perfumeId)).not.toBe(
      first.get(profileOne.recommendation.perfumeId),
    );
  });

  it("misses the cache for a different trait band", async () => {
    const { provider, calls } = countingProvider((_input, callIndex) =>
      callIndex === 0 ? TEXT_A : TEXT_B,
    );

    const profileOne = makeExplanationInput();
    const profileTwo = makeExplanationInput({
      traits: [{ label: "مرموز", value: 90 }],
    });

    await generateExplanations(provider, [profileOne]);
    const second = await generateExplanations(provider, [profileTwo]);

    expect(calls).toHaveLength(2);
    expect(second.get(profileTwo.recommendation.perfumeId)).toBe(TEXT_B);
  });
});

describe("Test 4 — different perfume facts", () => {
  it("misses the cache when a prompt-relevant perfume fact changes", async () => {
    const { provider, calls } = countingProvider((_input, callIndex) =>
      callIndex === 0 ? TEXT_A : TEXT_B,
    );

    const base = makeExplanationInput();
    const edited: AiExplanationInput = {
      ...base,
      perfume: { ...base.perfume, description: "عطری تازه و سبک برای روز" },
    };

    const first = await generateExplanations(provider, [base]);
    const second = await generateExplanations(provider, [edited]);

    expect(calls).toHaveLength(2);
    expect(first.get(base.recommendation.perfumeId)).toBe(TEXT_A);
    expect(second.get(edited.recommendation.perfumeId)).toBe(TEXT_B);
  });
});

describe("Test 5 — failure is not cached", () => {
  it("retries the provider on the next identical call after a failure", async () => {
    const { provider, calls } = countingProvider((_input, callIndex) => {
      if (callIndex === 0) {
        throw new Error("AI request timed out after 15000ms.");
      }
      return TEXT_A;
    });
    const input = makeExplanationInput();

    const failed = await generateExplanations(provider, [input]);
    expect(calls).toHaveLength(1);
    expect(failed.size).toBe(0);
    expect(explanationCacheSizeForTests()).toBe(0);

    const retried = await generateExplanations(provider, [input]);
    expect(calls).toHaveLength(2);
    expect(retried.get(input.recommendation.perfumeId)).toBe(TEXT_A);
    expect(explanationCacheSizeForTests()).toBe(1);
  });
});

describe("Test 6 — partial batch", () => {
  it("caches successes, never caches the failed item, and retries only it", async () => {
    const failing = new Set<string>(["perfume-ب"]);
    const { provider, calls } = countingProvider((input) => {
      if (failing.has(input.recommendation.perfumeId)) {
        throw new Error("socket hang up");
      }
      return TEXT_A;
    });

    const batch = [inputTagged("ا"), inputTagged("ب"), inputTagged("پ")];

    const partial = await generateExplanations(provider, batch);
    expect(calls).toHaveLength(3);
    expect(partial.size).toBe(2);
    expect(partial.has("perfume-ب")).toBe(false);
    expect(partial.get("perfume-ا")).toBe(TEXT_A);
    expect(partial.get("perfume-پ")).toBe(TEXT_A);
    expect(explanationCacheSizeForTests()).toBe(2);

    // The failed item is retryable; the two successes come from the cache.
    failing.clear();
    const complete = await generateExplanations(provider, batch);
    expect(calls).toHaveLength(4);
    expect(complete.size).toBe(3);
    expect(complete.get("perfume-ب")).toBe(TEXT_A);
    expect(explanationCacheSizeForTests()).toBe(3);
  });
});

describe("Test 7 — TTL", () => {
  it("serves the entry before TTL and regenerates after it expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { provider, calls } = countingProvider(() => TEXT_A);
    const input = makeExplanationInput();
    const start = Date.now();

    await generateExplanations(provider, [input]);
    expect(calls).toHaveLength(1);

    // Inside the TTL: cache hit, no provider call.
    vi.setSystemTime(start + EXPLANATION_CACHE_TTL_MS - 1_000);
    const hit = await generateExplanations(provider, [input]);
    expect(calls).toHaveLength(1);
    expect(hit.get(input.recommendation.perfumeId)).toBe(TEXT_A);

    // Past the TTL: expired entry is ignored (and lazily dropped).
    vi.setSystemTime(start + EXPLANATION_CACHE_TTL_MS + 1_000);
    const miss = await generateExplanations(provider, [input]);
    expect(calls).toHaveLength(2);
    expect(miss.get(input.recommendation.perfumeId)).toBe(TEXT_A);
  });
});

describe("Test 8 — maximum size", () => {
  it("never grows past the configured maximum and evicts the oldest entry", async () => {
    const { provider, calls } = countingProvider(() => TEXT_A);

    const total = EXPLANATION_CACHE_MAX_ENTRIES + 1;
    for (let i = 0; i < total; i += 1) {
      await generateExplanations(provider, [inputTagged(tag(i))]);
    }

    expect(explanationCacheSizeForTests()).toBe(EXPLANATION_CACHE_MAX_ENTRIES);
    expect(calls).toHaveLength(total);

    // The newest entry is still cached: no new provider call.
    await generateExplanations(provider, [inputTagged(tag(total - 1))]);
    expect(calls).toHaveLength(total);

    // The oldest (first) entry was evicted: it needs the provider again.
    await generateExplanations(provider, [inputTagged(tag(0))]);
    expect(calls).toHaveLength(total + 1);
    expect(explanationCacheSizeForTests()).toBe(EXPLANATION_CACHE_MAX_ENTRIES);
  });
});

describe("Test 9 — simultaneous identical requests", () => {
  it("shares one provider call between concurrent identical requests", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const calls: AiExplanationInput[] = [];
    const provider: AIProvider = {
      id: "test-cache-gated",
      isAvailable: () => true,
      unavailableReason: () => null,
      generatePerfumeProfile: async () => {
        throw new Error("not used in this suite");
      },
      generateRecommendationExplanation: async (input) => {
        calls.push(input);
        await gate;
        return {
          perfumeId: input.recommendation.perfumeId,
          explanation: TEXT_A,
        };
      },
    };

    const input = makeExplanationInput();

    // Both requests start before the first provider call resolves.
    const first = generateExplanations(provider, [input]);
    const second = generateExplanations(provider, [input]);

    release();
    const [resultOne, resultTwo] = await Promise.all([first, second]);

    expect(calls).toHaveLength(1);
    expect(resultOne.get(input.recommendation.perfumeId)).toBe(TEXT_A);
    expect(resultTwo.get(input.recommendation.perfumeId)).toBe(TEXT_A);
    expect(resultOne).toEqual(resultTwo);
  });

  it("never leaves a failed shared promise stuck for later requests", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    let attempts = 0;
    const provider: AIProvider = {
      id: "test-cache-gated-fail",
      isAvailable: () => true,
      unavailableReason: () => null,
      generatePerfumeProfile: async () => {
        throw new Error("not used in this suite");
      },
      generateRecommendationExplanation: async (input) => {
        attempts += 1;
        void input;
        await gate;
        throw new Error("AI request timed out after 15000ms.");
      },
    };

    const input = makeExplanationInput();

    const first = generateExplanations(provider, [input]);
    const second = generateExplanations(provider, [input]);
    release();

    const [resultOne, resultTwo] = await Promise.all([first, second]);
    expect(attempts).toBe(1);
    expect(resultOne.size).toBe(0);
    expect(resultTwo.size).toBe(0);
    expect(explanationCacheSizeForTests()).toBe(0);

    // The in-flight entry was cleaned up: a later request reaches the provider.
    const later = await generateExplanations(provider, [input]);
    expect(attempts).toBe(2);
    expect(later.size).toBe(0);
  });
});

describe("Test 10 — ranking independence", () => {
  it("leaves the deterministic recommendation ordering byte-identical", async () => {
    const { provider, calls } = countingProvider(() => TEXT_A);

    const before = JSON.stringify(makeMatchResult());

    // First run generates; the second is a pure cache hit — the engine never
    // observes either.
    await generateExplanations(provider, [makeExplanationInput()]);
    await generateExplanations(provider, [makeExplanationInput()]);
    expect(calls).toHaveLength(1);

    const after = JSON.stringify(makeMatchResult());
    expect(after).toBe(before);
  });

  it("keeps engine output identical for an all-failing provider", async () => {
    const baseline = matchPerfumes({
      storeId: TEST_STORE_ID,
      personalityVector: makeVector(50),
      perfumes: [
        {
          perfumeId: TEST_PERFUME_ID,
          storeId: TEST_STORE_ID,
          name: "نویر آزمون",
          brand: "خانه آزمون",
          inStock: true,
          active: true,
          profile: shiftedProfile(50, "bold", 5),
        },
      ],
    });
    const snapshot = JSON.stringify(baseline);

    const { provider } = countingProvider(() => {
      throw new Error("provider down");
    });
    await generateExplanations(provider, [makeExplanationInput()]);

    expect(JSON.stringify(baseline)).toBe(snapshot);
    expect(baseline.recommendations[0].rank).toBe(1);
  });
});
