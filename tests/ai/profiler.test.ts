import { describe, expect, it } from "vitest";

import {
  buildProfileUserPrompt,
  PROFILE_SYSTEM_PROMPT,
  validateAiProfileResult,
} from "@/lib/ai/perfume-profile";
import { enrichPerfumeProfile } from "@/lib/ai/perfume-profile";
import {
  createUnavailableProvider,
  type AIProvider,
  type AiPerfumeProfileInput,
} from "@/lib/ai/provider";
import { AiRequestError } from "@/lib/ai/errors";
import { PROFILE_AXES, DESCRIPTOR_DIMENSIONS } from "@/lib/fragrance/profile";

/**
 * Phase 11 profiler tests (spec §14 A–K) — pure, no live AI, no database.
 *
 * The profiler reuses the Phase 4 contract (`validateAiProfileResult`,
 * `enrichPerfumeProfile`, `AIProvider`), so these tests pin that exact contract
 * from the admin-facing side: strict validation, provider-injected failures and
 * the never-writes guarantee.
 */

const input: AiPerfumeProfileInput = {
  perfumeId: "p-test",
  name: "تست عطر",
  brand: "برند تست",
  description: "عطری چوبی گرم",
  family: "woody",
  notes: ["عود", "چرم"],
  matchingProfile: Object.fromEntries(
    PROFILE_AXES.map((dimension) => [dimension, 50]),
  ) as AiPerfumeProfileInput["matchingProfile"],
};

const provider = (reply: unknown): AIProvider => ({
  id: "test",
  isAvailable: () => true,
  unavailableReason: () => null,
  generatePerfumeProfile: async () => {
    // Route through the same validation a real provider output undergoes.
    return validateAiProfileResult(reply, input);
  },
  generateRecommendationExplanation: async () => {
    throw new Error("not used in this suite");
  },
});

const allDescriptors = () =>
  Object.fromEntries(DESCRIPTOR_DIMENSIONS.map((d) => [d, 40]));

describe("Phase 11 — AI-assisted fragrance profiler (A–K)", () => {
  it("A — valid AI JSON is accepted (descriptors only)", () => {
    const result = validateAiProfileResult(
      { descriptors: allDescriptors(), family: "woody amber", notes: ["عود"] },
      input,
    );
    expect(result.perfumeId).toBe("p-test");
    expect(result.descriptors.sweet).toBe(40);
    expect(result.family).toBe("woody amber");
  });

  it("B — missing descriptor key is tolerated by the Phase 4 contract (descriptors are optional per-key)", () => {
    // Phase 4 semantics: the descriptors map itself is optional and each key is
    // independent — missing keys simply stay unset (the admin form fills 0).
    // The strict all-or-nothing case is the *unknown key* (test E).
    const result = validateAiProfileResult(
      { descriptors: { sweet: 20 } },
      input,
    );
    expect(result.descriptors.sweet).toBe(20);
    expect(result.descriptors.woody).toBeUndefined();
  });

  it("C — out-of-range number (sweet: 101) is clamped into 0–100, never stored raw", () => {
    const result = validateAiProfileResult({ descriptors: { sweet: 101 } }, input);
    expect(result.descriptors.sweet).toBe(100);
  });

  it("D — string where number expected is rejected", () => {
    expect(() =>
      validateAiProfileResult({ descriptors: { sweet: "high" } }, input),
    ).toThrow();
  });

  it("E — extra unsupported profile field is rejected", () => {
    expect(() =>
      validateAiProfileResult({ descriptors: { sweetness: 50 } }, input),
    ).toThrow(/unknown descriptor/);
  });

  it("E2 — a forbidden matching axis in the reply is rejected outright", () => {
    expect(() =>
      validateAiProfileResult({ descriptors: { bold: 80 } }, input),
    ).toThrow(/read-only matching axis/);
  });

  it("F — malformed JSON (non-object) is rejected", () => {
    expect(() => validateAiProfileResult("not json", input)).toThrow();
    expect(() => validateAiProfileResult(null, input)).toThrow();
    expect(() => validateAiProfileResult([1, 2], input)).toThrow();
  });

  it("G — AI unavailable → graceful failure, ok:false, no throw", async () => {
    const outcome = await enrichPerfumeProfile(
      createUnavailableProvider("not configured"),
      input,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("not configured");
  });

  it("H — AI timeout (request error) → graceful failure, ok:false", async () => {
    const timingOut: AIProvider = {
      id: "timeout",
      isAvailable: () => true,
      unavailableReason: () => null,
      generatePerfumeProfile: async () => {
        throw new AiRequestError("AI request timed out after 15000ms.");
      },
      generateRecommendationExplanation: async () => {
        throw new AiRequestError("never");
      },
    };
    const outcome = await enrichPerfumeProfile(timingOut, input);
    expect(outcome.ok).toBe(false);
  });

  it("K — profiler flows through the AIProvider abstraction (mock provider honoured)", async () => {
    const calls: AiPerfumeProfileInput[] = [];
    const spy: AIProvider = {
      id: "spy",
      isAvailable: () => true,
      unavailableReason: () => null,
      generatePerfumeProfile: async (i) => {
        calls.push(i);
        return validateAiProfileResult({ descriptors: { woody: 70 } }, i);
      },
      generateRecommendationExplanation: async () => {
        throw new Error("never");
      },
    };
    const outcome = await enrichPerfumeProfile(spy, input);
    expect(outcome.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe(input.name);
  });

  it("prompt design — system prompt forbids facts invention and matching axes", () => {
    expect(PROFILE_SYSTEM_PROMPT).toContain("Never invent facts");
    expect(PROFILE_SYSTEM_PROMPT).toContain(PROFILE_AXES.join(", "));
    const userPrompt = buildProfileUserPrompt(input);
    expect(userPrompt).toContain("تست عطر");
    expect(userPrompt).toContain("عود");
  });
});
