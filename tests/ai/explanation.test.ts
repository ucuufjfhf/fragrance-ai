import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EXPLANATION_BATCH_BUDGET_MS,
  EXPLANATION_MAX_CHARS,
  EXPLANATION_SYSTEM_PROMPT,
  buildExplanationUserPrompt,
  describeTraitLevel,
  generateExplanation,
  generateExplanations,
  resetExplanationCacheForTests,
  selectUserTraits,
  validateAiExplanation,
} from "@/lib/ai/explanation";
import {
  createUnavailableProvider,
  type AiExplanationInput,
  type AIProvider,
} from "@/lib/ai/provider";
import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import { PERSONALITY_LABELS } from "@/lib/personality/labels";
import { makeExplanationInput, makeVector } from "./fixtures";

/** Valid Persian copy: no digits, 40–400 chars, no invented products. */
const VALID_TEXT =
  "این عطر با سلیقه گرم و مرموز تو هماهنگه و همون حس خاصی که دنبالش هستی رو منتقل می‌کنه.";

const explanationProvider = (
  generate: AIProvider["generateRecommendationExplanation"],
): AIProvider => ({
  id: "test-explanation",
  isAvailable: () => true,
  unavailableReason: () => null,
  generatePerfumeProfile: async () => {
    throw new Error("not used");
  },
  generateRecommendationExplanation: generate,
});

describe("EXPLANATION_SYSTEM_PROMPT", () => {
  it("asks for the polite plural «شما» register the UI uses", () => {
    // Regression guard: the prompt used to request the informal singular (تو)
    // while the card heading above every explanation reads «چرا بهتون میاد؟».
    expect(EXPLANATION_SYSTEM_PROMPT).toContain("شما");
    expect(EXPLANATION_SYSTEM_PROMPT).toContain("می‌کنید");
    expect(EXPLANATION_SYSTEM_PROMPT).not.toContain("(تو)");
  });

  it("grounds the match in the scent traits and the perfume facts only", () => {
    // Regression guard: the prompt used to send the shopper's top four values
    // across all nine axes, so a social/expressive vector could be credited for
    // a match the matcher never used it for.
    expect(EXPLANATION_SYSTEM_PROMPT).toContain(
      "Base the explanation only on the scent traits listed and the perfume facts supplied; never attribute the match to another personality trait.",
    );
  });
});

describe("describeTraitLevel", () => {
  it("maps 0–100 values onto Persian bands", () => {
    expect(describeTraitLevel(100)).toBe("بالا");
    expect(describeTraitLevel(70)).toBe("بالا");
    expect(describeTraitLevel(69)).toBe("متوسط");
    expect(describeTraitLevel(45)).toBe("متوسط");
    expect(describeTraitLevel(44)).toBe("پایین");
    expect(describeTraitLevel(0)).toBe("پایین");
  });
});

describe("selectUserTraits", () => {
  it("returns Persian-labelled traits, most pronounced first", () => {
    const vector = { ...makeVector(50), mysterious: 90, bold: 80 };

    const traits = selectUserTraits(vector);

    expect(traits[0]).toEqual({ label: PERSONALITY_LABELS.mysterious, value: 90 });
    expect(traits[1]).toEqual({ label: PERSONALITY_LABELS.bold, value: 80 });
    expect(traits.length).toBeLessThanOrEqual(4);

    for (const trait of traits) {
      expect(trait.label).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it("is deterministic when every trait is equal (matching order wins)", () => {
    // Amended deliberately: the source of truth for trait selection is now
    // MATCHING_DIMENSIONS, not the nine personality dimensions.
    const traits = selectUserTraits(makeVector(50));

    expect(traits.map((trait) => trait.label)).toEqual(
      MATCHING_DIMENSIONS.slice(0, traits.length).map(
        (dimension) => PERSONALITY_LABELS[dimension],
      ),
    );
    expect(traits).toEqual(selectUserTraits(makeVector(50)));
  });

  it("skips the four personality-only axes even when they dominate the vector", () => {
    // Every non-matching axis is maxed; the matching ones are lower and distinct.
    const vector = {
      ...makeVector(10),
      social: 100,
      adventurous: 100,
      expressive: 100,
      experimental: 100,
      fresh: 60,
      warm: 50,
      mysterious: 40,
      elegant: 30,
      bold: 20,
    };

    const traits = selectUserTraits(vector);

    expect(traits).toEqual([
      { label: PERSONALITY_LABELS.fresh, value: 60 },
      { label: PERSONALITY_LABELS.warm, value: 50 },
      { label: PERSONALITY_LABELS.mysterious, value: 40 },
      { label: PERSONALITY_LABELS.elegant, value: 30 },
    ]);

    const labels = traits.map((trait) => trait.label);

    expect(labels).not.toContain("اجتماعی");
    expect(labels).not.toContain("ماجراجو");
    expect(labels).not.toContain("پرشور");
    expect(labels).not.toContain("تجربه‌گرا");
  });
});

describe("buildExplanationUserPrompt", () => {
  it("sends facts and qualitative bands only — never numbers", () => {
    const input = makeExplanationInput();
    const prompt = buildExplanationUserPrompt(input);

    expect(prompt).toContain(input.archetypeLabel);
    expect(prompt).toContain(input.perfume.name);
    expect(prompt).toContain(input.perfume.brand);
    expect(prompt).toContain("عود");
    expect(prompt).toMatch(/بالا|متوسط|پایین/);

    // no score, rank or any digit reaches the model
    expect(prompt).not.toMatch(/[0-9]/);
    expect(prompt).not.toContain("امتیاز");
    expect(prompt).toContain("explanation");
  });

  it("names the scent traits and none of the four personality-only axes", () => {
    const vector = {
      ...makeVector(10),
      social: 100,
      adventurous: 100,
      expressive: 100,
      experimental: 100,
      fresh: 60,
      warm: 50,
      mysterious: 40,
      elegant: 30,
      bold: 20,
    };
    const traits = selectUserTraits(vector);
    const prompt = buildExplanationUserPrompt(makeExplanationInput({ traits }));

    expect(prompt).toContain("ویژگی‌های عطری برجسته کاربر");

    for (const trait of traits) {
      expect(prompt).toContain(trait.label);
    }

    for (const excluded of ["اجتماعی", "ماجراجو", "پرشور", "تجربه‌گرا"]) {
      expect(prompt).not.toContain(excluded);
    }
  });
});

describe("validateAiExplanation", () => {
  it("accepts Persian copy and normalises whitespace", () => {
    const result = validateAiExplanation(
      { explanation: `  ${VALID_TEXT}\n  ` },
      makeExplanationInput(),
    );

    expect(result.perfumeId).toBe(makeExplanationInput().recommendation.perfumeId);
    expect(result.explanation).toBe(VALID_TEXT);
    expect(result.explanation).not.toMatch(/\s{2,}/);
  });

  it("accepts a reply that quotes the recommended perfume or its brand", () => {
    const input = makeExplanationInput();

    expect(() =>
      validateAiExplanation(
        {
          explanation: `عطر «${input.perfume.name}» با سلیقه گرم تو هماهنگه و حس خاصی بهت می‌ده.`,
        },
        input,
      ),
    ).not.toThrow();

    expect(() =>
      validateAiExplanation(
        {
          explanation: `از برند «${input.perfume.brand}» عطری انتخاب شده که با تو جور درمیاد و خاصه.`,
        },
        input,
      ),
    ).not.toThrow();
  });

  it("rejects invented products, numbers and non-Persian replies", () => {
    const input = makeExplanationInput();
    const invalid: Array<[string, unknown]> = [
      [
        "a quoted unknown product",
        { explanation: "این عطر شبیه «عطر جعلی» است و برای سلیقه تو مناسبه و حسه." },
      ],
      [
        "latin digits",
        { explanation: "این عطر با سلیقه تو 92 درصد هماهنگه و برای تو مناسبه و خیلی خاصه." },
      ],
      [
        "persian digits",
        { explanation: "این عطر با سلیقه تو ۹۲ درصد هماهنگه و برای تو مناسبه و خیلی خاصه." },
      ],
      [
        "a percentage sign",
        { explanation: "این عطر با سلیقه تو هماهنگی بالایی داره و برای تو مناسبه و خاصه ٪" },
      ],
      [
        "an English reply",
        { explanation: "This perfume matches your warm and mysterious taste very well indeed." },
      ],
      ["an extra key", { explanation: VALID_TEXT, score: 92 }],
      ["a missing explanation", {}],
      ["a non-string explanation", { explanation: 42 }],
      ["a too-short reply", { explanation: "خوبه" }],
      ["a too-long reply", { explanation: "ا".repeat(EXPLANATION_MAX_CHARS + 1) }],
      ["a non-object payload", VALID_TEXT],
      ["an array payload", [VALID_TEXT]],
      ["a null payload", null],
    ];

    for (const [name, raw] of invalid) {
      expect(() => validateAiExplanation(raw, input), name).toThrow(/AI/);
    }
  });
});

describe("generateExplanation", () => {
  it("degrades to ok:false for an unavailable provider", async () => {
    const outcome = await generateExplanation(
      createUnavailableProvider("credentials missing"),
      makeExplanationInput(),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("credentials missing");
    }
  });

  it("reports an invalid reply as ok:false instead of returning bad copy", async () => {
    const provider = explanationProvider(async (input) => ({
      perfumeId: input.recommendation.perfumeId,
      explanation: "این عطر ۹۹ درصد با تو هماهنگه و برای تو مناسبه و خیلی خاصه.",
    }));

    const outcome = await generateExplanation(provider, makeExplanationInput());

    expect(outcome.ok).toBe(false);
  });

  it("returns the validated explanation on success", async () => {
    const provider = explanationProvider(async (input) => ({
      perfumeId: input.recommendation.perfumeId,
      explanation: VALID_TEXT,
    }));

    const outcome = await generateExplanation(provider, makeExplanationInput());

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.explanation).toBe(VALID_TEXT);
    }
  });
});

describe("generateExplanations", () => {
  // The prompt-hash cache is process-local: start every case from an empty
  // cache so these assertions observe provider behaviour, not cache state.
  beforeEach(() => {
    resetExplanationCacheForTests();
  });

  it("keeps successes and skips failures without throwing", async () => {
    const input = makeExplanationInput();
    const provider = explanationProvider(async (candidate) => {
      if (candidate.recommendation.rank > 1) {
        throw new Error("second recommendation failed");
      }

      return {
        perfumeId: candidate.recommendation.perfumeId,
        explanation: VALID_TEXT,
      };
    });

    const explanations = await generateExplanations(provider, [input]);

    expect(explanations.size).toBe(1);
    expect(explanations.get(input.recommendation.perfumeId)).toBe(VALID_TEXT);
  });

  it("keeps one entry per duplicate and survives a dead provider", async () => {
    const input = makeExplanationInput();

    const duplicated = await generateExplanations(
      explanationProvider(async (candidate) => ({
        perfumeId: candidate.recommendation.perfumeId,
        explanation: VALID_TEXT,
      })),
      [input, input],
    );

    expect(duplicated.size).toBe(1);

    // The dead-provider assertion is about a COLD cache: with the prompt-hash
    // cache a prior success would legitimately be served without the provider,
    // so reset before checking the failure path.
    resetExplanationCacheForTests();

    const dead = await generateExplanations(createUnavailableProvider("no ai"), [
      input,
      input,
    ]);

    expect(dead.size).toBe(0);
  });
});

describe("generateExplanations batch budget", () => {
  beforeEach(() => {
    resetExplanationCacheForTests();
  });

  const base = makeExplanationInput();
  /** Distinct names matter: the cache key is the prompt, not the perfume id. */
  const NAMES = ["نویر", "باران", "آتش"];

  /** `count` distinct items — different prompts, so different cache keys. */
  const batch = (count: number): AiExplanationInput[] =>
    Array.from({ length: count }, (_, index) => {
      const perfumeId = `perfume-budget-${index + 1}`;
      const name = NAMES[index] ?? `عطر ${perfumeId}`;

      return {
        ...base,
        recommendation: { ...base.recommendation, perfumeId },
        perfume: { ...base.perfume, perfumeId, name },
      };
    });

  it("pins one named budget for the whole batch", () => {
    expect(EXPLANATION_BATCH_BUDGET_MS).toBe(20_000);
  });

  it("stops at the deadline instead of waiting for every hanging call", async () => {
    const call = vi.fn(() => new Promise<never>(() => {}));

    const startedAt = Date.now();
    const explanations = await generateExplanations(
      explanationProvider(call),
      batch(3),
      { budgetMs: 40 },
    );
    const elapsed = Date.now() - startedAt;

    expect(explanations.size).toBe(0);
    // Only the first item was attempted: the deadline ended the loop, so the
    // second and third hangs never happen (the pre-budget worst case was ~45s).
    expect(call).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(2_000);
  });

  it("keeps the partial result when the deadline lands between items", async () => {
    const call = vi.fn(async (input: AiExplanationInput) => {
      // The first answer is free; the second outlives the whole budget.
      if (input.recommendation.perfumeId.endsWith("2")) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      return {
        perfumeId: input.recommendation.perfumeId,
        explanation: VALID_TEXT,
      };
    });

    const explanations = await generateExplanations(
      explanationProvider(call),
      batch(3),
      { budgetMs: 60 },
    );

    expect(call).toHaveBeenCalledTimes(2);
    expect(explanations.size).toBe(1);
    expect(explanations.get("perfume-budget-1")).toBe(VALID_TEXT);
  });

  it("still generates every item when the provider answers quickly", async () => {
    const seen: string[] = [];
    const provider = explanationProvider(async (input) => {
      seen.push(input.recommendation.perfumeId);

      return {
        perfumeId: input.recommendation.perfumeId,
        explanation: VALID_TEXT,
      };
    });

    const explanations = await generateExplanations(provider, batch(3));

    expect(seen).toHaveLength(3);
    expect(explanations.size).toBe(3);
  });

  it("serves a cache hit for free and skips only the uncached item", async () => {
    const [cached, uncached] = batch(2);
    const prime = vi.fn(async (input: AiExplanationInput) => ({
      perfumeId: input.recommendation.perfumeId,
      explanation: VALID_TEXT,
    }));
    await generateExplanations(explanationProvider(prime), [cached]);
    expect(prime).toHaveBeenCalledTimes(1);

    // Budget already gone: the cached item costs nothing and is still served,
    // while the uncached one is skipped rather than delaying the render.
    const call = vi.fn(async (input: AiExplanationInput) => ({
      perfumeId: input.recommendation.perfumeId,
      explanation: VALID_TEXT,
    }));
    const explanations = await generateExplanations(
      explanationProvider(call),
      [cached, uncached],
      { budgetMs: 0 },
    );

    expect(explanations.get(cached.recommendation.perfumeId)).toBe(VALID_TEXT);
    expect(explanations.has(uncached.recommendation.perfumeId)).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });
});
