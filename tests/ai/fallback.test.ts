import { describe, expect, it } from "vitest";

import {
  buildExplanationUserPrompt,
  generateExplanation,
  generateExplanations,
} from "@/lib/ai/explanation";
import {
  AiRequestError,
  createUnavailableProvider,
  type AIProvider,
} from "@/lib/ai/provider";
import { matchPerfumes } from "@/lib/matching/engine";
import { makeVector, shiftedProfile, TEST_PERFUME_ID, TEST_STORE_ID } from "./fixtures";
import type { AiExplanationInput } from "@/lib/ai/provider";

/**
 * Proves the Phase 3 promise end-to-end: the deterministic result is identical
 * whether AI is absent, slow, failing or healthy — and no score or rank ever
 * crosses the AI boundary.
 */

const VALID_TEXT =
  "این عطر با سلیقه گرم و مرموز تو هماهنگه و همون حس خاصی که دنبالش هستی رو منتقل می‌کنه.";

const providerWith = (
  generate: AIProvider["generateRecommendationExplanation"],
): AIProvider => ({
  id: "test-provider",
  isAvailable: () => true,
  unavailableReason: () => null,
  generatePerfumeProfile: async () => {
    throw new Error("not used in this suite");
  },
  generateRecommendationExplanation: generate,
});

/** Builds the explanation input straight from a real engine result. */
function explanationInputFor(rank = 0): AiExplanationInput {
  const result = matchPerfumes({
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

  const recommendation = result.recommendations[rank];

  return {
    recommendation,
    archetypeLabel: "کاشف مرموز",
    perfume: {
      perfumeId: recommendation.perfumeId,
      name: recommendation.name,
      brand: recommendation.brand,
      family: "woody amber",
      notes: ["عود", "چرم"],
    },
    traits: [{ label: "مرموز", value: 70 }],
  };
}

describe("AI independence of the deterministic engine", () => {
  it("keeps the engine output untouched for missing, failing, slow and healthy providers", async () => {
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

    const providers: AIProvider[] = [
      // AI completely absent (the current project state: no credentials)
      createUnavailableProvider("AI provider \"qwen\" is not configured."),
      // AI too slow
      providerWith(async () => {
        throw new AiRequestError("AI request timed out after 15000ms.");
      }),
      // AI reachable but broken
      providerWith(async () => {
        throw new Error("socket hang up");
      }),
      // AI healthy
      providerWith(async (input) => ({
        perfumeId: input.recommendation.perfumeId,
        explanation: VALID_TEXT,
      })),
    ];

    for (const provider of providers) {
      await generateExplanations(provider, [explanationInputFor()]);

      expect(JSON.stringify(baseline)).toBe(snapshot);
      expect(baseline.recommendations).toHaveLength(1);
      expect(baseline.recommendations[0].perfumeId).toBe(TEST_PERFUME_ID);
      expect(baseline.recommendations[0].rank).toBe(1);
    }
  });

  it("re-derives byte-identical rankings after an AI call", () => {
    const build = () =>
      matchPerfumes({
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
          {
            perfumeId: "perfume-test-fresh",
            storeId: TEST_STORE_ID,
            name: "تازه آزمون",
            brand: "خانه آزمون",
            inStock: true,
            active: true,
            profile: shiftedProfile(50, "bold", 30),
          },
        ],
      });

    const before = build();
    void generateExplanations(
      providerWith(async (input) => ({
        perfumeId: input.recommendation.perfumeId,
        explanation: VALID_TEXT,
      })),
      [explanationInputFor()],
    );
    const after = build();

    expect(after).toEqual(before);
  });

  it("returns only perfumeId and explanation from the AI layer", async () => {
    const outcome = await generateExplanation(
      providerWith(async (input) => ({
        perfumeId: input.recommendation.perfumeId,
        explanation: VALID_TEXT,
      })),
      explanationInputFor(),
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(Object.keys(outcome.value).sort()).toEqual([
        "explanation",
        "perfumeId",
      ]);
    }
  });

  it("never sends the score, rank or any number to the model", () => {
    const input = explanationInputFor();
    const prompt = buildExplanationUserPrompt(input);

    expect(prompt).not.toMatch(/[0-9]/);
    expect(prompt).not.toContain("score");
    expect(prompt).not.toContain("rank");
    expect(prompt).not.toContain(String(input.recommendation.presentationScore));
  });
});
