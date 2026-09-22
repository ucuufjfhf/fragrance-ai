import { describe, expect, it } from "vitest";

import {
  AI_WRITABLE_DIMENSIONS,
  AiUnavailableError,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_TIMEOUT_MS,
  createAIProvider,
  createUnavailableProvider,
  readAiConfig,
} from "@/lib/ai/provider";
import { DESCRIPTOR_DIMENSIONS, MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import { makeExplanationInput, makeProfileInput } from "./fixtures";

/** Valid configuration shape (fake credentials — never real keys). */
const configured = {
  provider: "qwen",
  apiKey: "test-key",
  baseUrl: "https://ai.example/v1",
  model: DEFAULT_AI_MODEL,
  timeoutMs: DEFAULT_AI_TIMEOUT_MS,
};

describe("readAiConfig", () => {
  it("reads the documented environment variables", () => {
    const config = readAiConfig({
      AI_PROVIDER: "QWEN",
      QWEN_API_KEY: "test-key",
      QWEN_BASE_URL: "https://ai.example/v1",
      QWEN_MODEL: "qwen3.6",
      QWEN_TIMEOUT_MS: "9000",
    });

    expect(config).toEqual({
      provider: "qwen",
      apiKey: "test-key",
      baseUrl: "https://ai.example/v1",
      model: "qwen3.6",
      timeoutMs: 9000,
    });
  });

  it("falls back to safe defaults when values are missing or invalid", () => {
    const empty = readAiConfig({});

    expect(empty.provider).toBe("qwen");
    expect(empty.apiKey).toBe("");
    expect(empty.baseUrl).toBe("");
    expect(empty.model).toBe(DEFAULT_AI_MODEL);
    expect(empty.timeoutMs).toBe(DEFAULT_AI_TIMEOUT_MS);

    expect(readAiConfig({ QWEN_TIMEOUT_MS: "0" }).timeoutMs).toBe(
      DEFAULT_AI_TIMEOUT_MS,
    );
    expect(readAiConfig({ QWEN_TIMEOUT_MS: "-5" }).timeoutMs).toBe(
      DEFAULT_AI_TIMEOUT_MS,
    );
    expect(readAiConfig({ QWEN_TIMEOUT_MS: "not-a-number" }).timeoutMs).toBe(
      DEFAULT_AI_TIMEOUT_MS,
    );
    expect(readAiConfig({ QWEN_MODEL: "   " }).model).toBe(DEFAULT_AI_MODEL);
  });
});

describe("createAIProvider", () => {
  it("returns an available provider when the qwen credentials are present", () => {
    const provider = createAIProvider(configured);

    expect(provider.id).toBe("qwen");
    expect(provider.isAvailable()).toBe(true);
    expect(provider.unavailableReason()).toBeNull();
  });

  it("degrades to an unavailable provider when credentials are missing", () => {
    const missingKey = createAIProvider({ ...configured, apiKey: "" });
    expect(missingKey.isAvailable()).toBe(false);
    expect(missingKey.id).toBe("unavailable");
    expect(missingKey.unavailableReason()).toContain("QWEN_API_KEY");
    expect(missingKey.unavailableReason()).not.toContain("QWEN_BASE_URL");

    const missingBaseUrl = createAIProvider({ ...configured, baseUrl: "" });
    expect(missingBaseUrl.isAvailable()).toBe(false);
    expect(missingBaseUrl.unavailableReason()).toContain("QWEN_BASE_URL");

    const missingBoth = createAIProvider({
      ...configured,
      apiKey: "",
      baseUrl: "",
    });
    expect(missingBoth.unavailableReason()).toContain("QWEN_API_KEY, QWEN_BASE_URL");
  });

  it("treats AI_PROVIDER=none as explicitly disabled", () => {
    const provider = createAIProvider({ ...configured, provider: "none" });

    expect(provider.isAvailable()).toBe(false);
    expect(provider.unavailableReason()).toContain("disabled");
  });

  it("rejects unknown providers without throwing", () => {
    const provider = createAIProvider({ ...configured, provider: "some-other-llm" });

    expect(provider.isAvailable()).toBe(false);
    expect(provider.unavailableReason()).toContain("some-other-llm");
  });

  it("never leaks the API key through the unavailable reason", () => {
    const provider = createAIProvider({ ...configured, baseUrl: "" });

    expect(provider.unavailableReason() ?? "").not.toContain("test-key");
  });
});

describe("unavailable provider", () => {
  it("reports itself honestly and fails loudly on use", async () => {
    const provider = createUnavailableProvider("credentials missing");

    expect(provider.isAvailable()).toBe(false);
    expect(provider.unavailableReason()).toBe("credentials missing");

    await expect(
      provider.generatePerfumeProfile(makeProfileInput()),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(
      provider.generateRecommendationExplanation(makeExplanationInput()),
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe("AI write scope", () => {
  it("allows only descriptor dimensions and never a matching axis", () => {
    expect(AI_WRITABLE_DIMENSIONS).toEqual(DESCRIPTOR_DIMENSIONS);

    for (const axis of MATCHING_DIMENSIONS) {
      expect(AI_WRITABLE_DIMENSIONS).not.toContain(axis);
    }
  });
});
