import { describe, expect, it } from "vitest";

import {
  EXPLANATION_MAX_CHARS,
  buildExplanationUserPrompt,
  describeTraitLevel,
  generateExplanation,
  generateExplanations,
  selectUserTraits,
  validateAiExplanation,
} from "@/lib/ai/explanation";
import { createUnavailableProvider, type AIProvider } from "@/lib/ai/provider";
import { PERSONALITY_LABELS } from "@/lib/personality/labels";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
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

  it("is deterministic when every trait is equal (canonical order wins)", () => {
    const traits = selectUserTraits(makeVector(50));

    expect(traits.map((trait) => trait.label)).toEqual(
      PERSONALITY_DIMENSIONS.slice(0, traits.length).map(
        (dimension) => PERSONALITY_LABELS[dimension],
      ),
    );
    expect(traits).toEqual(selectUserTraits(makeVector(50)));
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

    const dead = await generateExplanations(createUnavailableProvider("no ai"), [
      input,
      input,
    ]);

    expect(dead.size).toBe(0);
  });
});
