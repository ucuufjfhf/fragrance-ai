import { describe, expect, it } from "vitest";

import {
  PROFILE_DESCRIPTION_MAX_CHARS,
  buildProfileUserPrompt,
  enrichPerfumeProfile,
  validateAiProfileResult,
} from "@/lib/ai/perfume-profile";
import {
  createAIProvider,
  AiResponseError,
  type AIProvider,
  type AiPerfumeProfileResult,
} from "@/lib/ai/provider";
import { DESCRIPTOR_DIMENSIONS, MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import { makeProfileInput } from "./fixtures";

describe("buildProfileUserPrompt", () => {
  it("describes the facts and marks the matching axes read-only", () => {
    const input = makeProfileInput();
    const prompt = buildProfileUserPrompt(input);

    expect(prompt).toContain(input.name);
    expect(prompt).toContain(input.brand);
    expect(prompt).toContain("woody amber");
    expect(prompt).toContain("عود");
    expect(prompt).toContain("read-only");

    for (const axis of MATCHING_DIMENSIONS) {
      expect(prompt).toContain(axis);
    }

    // Scores, ranks and prices never travel to the model.
    expect(prompt).not.toContain("score");
    expect(prompt).not.toContain("rank");
    expect(prompt).not.toContain("price");
  });

  it("caps a very long merchant description", () => {
    const long = "ط".repeat(PROFILE_DESCRIPTION_MAX_CHARS + 50);
    const prompt = buildProfileUserPrompt(makeProfileInput({ description: long }));

    expect(prompt).not.toContain(long);
    expect(prompt).toContain("ط".repeat(PROFILE_DESCRIPTION_MAX_CHARS));
  });

  it("lists the existing descriptors when a profile already has some", () => {
    const prompt = buildProfileUserPrompt(
      makeProfileInput({ descriptors: { woody: 80, sweet: 20 } }),
    );

    expect(prompt).toContain("woody=80");
    expect(prompt).toContain("sweet=20");
  });
});

describe("validateAiProfileResult", () => {
  it("accepts and normalises a well-formed reply", () => {
    const result = validateAiProfileResult(
      {
        descriptors: { woody: 120, sweet: -4, longevity: 71.6 },
        family: "  woody amber  ",
        notes: [" عود ", "چرم", "   "],
      },
      makeProfileInput(),
    );

    expect(result.perfumeId).toBe(makeProfileInput().perfumeId);
    expect(result.descriptors).toEqual({ woody: 100, sweet: 0, longevity: 72 });
    expect(result.family).toBe("woody amber");
    expect(result.notes).toEqual(["عود", "چرم"]);
  });

  it("returns only descriptors, family and notes — never a matching axis", () => {
    const result = validateAiProfileResult(
      { descriptors: { woody: 50 }, family: "woody" },
      makeProfileInput(),
    );

    expect(Object.keys(result).sort()).toEqual(["descriptors", "family", "perfumeId"]);

    for (const axis of MATCHING_DIMENSIONS) {
      expect(result.descriptors).not.toHaveProperty(axis);
    }

    for (const key of Object.keys(result.descriptors)) {
      expect(DESCRIPTOR_DIMENSIONS).toContain(key);
    }
  });

  it("rejects replies that try to write forbidden or unknown keys", () => {
    const invalid: Array<[string, unknown]> = [
      ["a score", { score: 90 }],
      ["a rank", { rank: 1 }],
      ["a price", { price: 1000 }],
      ["a matching axis", { descriptors: { social: 80 } }],
      ["an unknown descriptor", { descriptors: { vanilla: 50 } }],
      ["a non-numeric descriptor", { descriptors: { woody: "high" } }],
      ["a null descriptor", { descriptors: { woody: null } }],
      ["a non-finite descriptor", { descriptors: { woody: Number.NaN } }],
      ["a non-string family", { family: 5 }],
      ["a non-array notes field", { notes: "عود" }],
      ["non-string notes", { notes: ["عود", 5] }],
      ["a non-object payload", "descriptors: woody 50"],
      ["an array payload", []],
      ["an empty payload", {}],
      ["a null payload", null],
    ];

    for (const [name, raw] of invalid) {
      expect(
        () => validateAiProfileResult(raw, makeProfileInput()),
        name,
      ).toThrow(AiResponseError);
    }
  });

  it("caps the amount of notes a reply can add", () => {
    const result = validateAiProfileResult(
      { notes: Array.from({ length: 20 }, (_value, index) => `نُت ${"x".repeat(1)}${index}`) },
      makeProfileInput(),
    );

    expect(result.notes?.length).toBeLessThanOrEqual(8);
  });
});

describe("enrichPerfumeProfile", () => {
  it("degrades to ok:false when the provider is unavailable", async () => {
    const provider = createAIProvider({
      provider: "qwen",
      apiKey: "",
      baseUrl: "",
      model: "qwen3.6",
      timeoutMs: 1_000,
    });

    const outcome = await enrichPerfumeProfile(provider, makeProfileInput());

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("QWEN_API_KEY");
    }
  });

  it("degrades to ok:false when the provider throws", async () => {
    const provider: AIProvider = {
      id: "test-throwing",
      isAvailable: () => true,
      unavailableReason: () => null,
      generatePerfumeProfile: async () => {
        throw new Error("upstream exploded");
      },
      generateRecommendationExplanation: async () => {
        throw new Error("not used");
      },
    };

    const outcome = await enrichPerfumeProfile(provider, makeProfileInput());

    expect(outcome).toEqual({ ok: false, reason: "upstream exploded" });
  });

  it("returns the validated result when the provider succeeds", async () => {
    const value: AiPerfumeProfileResult = {
      perfumeId: makeProfileInput().perfumeId,
      descriptors: { woody: 60 },
    };

    const provider: AIProvider = {
      id: "test-ok",
      isAvailable: () => true,
      unavailableReason: () => null,
      generatePerfumeProfile: async () => value,
      generateRecommendationExplanation: async () => {
        throw new Error("not used");
      },
    };

    await expect(
      enrichPerfumeProfile(provider, makeProfileInput()),
    ).resolves.toEqual({ ok: true, value });
  });
});
