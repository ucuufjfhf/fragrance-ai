import { describe, expect, it } from "vitest";

import {
  AI_WRITABLE_DIMENSIONS,
  AiUnavailableError,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_TIMEOUT_MS,
  createAIProvider,
  createUnavailableProvider,
  readAiConfig,
} from "@/lib/ai/provider";
import { DESCRIPTOR_DIMENSIONS, PROFILE_AXES } from "@/lib/fragrance/profile";
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
      QWEN_MODEL: "gapgpt-qwen-3.6",
      QWEN_TIMEOUT_MS: "9000",
    });

    expect(config).toEqual({
      provider: "qwen",
      apiKey: "test-key",
      baseUrl: "https://ai.example/v1",
      model: "gapgpt-qwen-3.6",
      timeoutMs: 9000,
    });
  });

  it("falls back to safe defaults when values are missing or invalid", () => {
    const empty = readAiConfig({});

    expect(empty.provider).toBe("qwen");
    expect(empty.apiKey).toBe("");
    expect(empty.baseUrl).toBe(DEFAULT_AI_BASE_URL);
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

describe("GapGPT target defaults", () => {
  it("resolves the documented GapGPT base URL and Qwen 3.6 model id", () => {
    expect(DEFAULT_AI_BASE_URL).toBe("https://api.gapgpt.app/v1");
    expect(DEFAULT_AI_MODEL).toBe("gapgpt-qwen-3.6");
  });

  it("reads the migrated config verbatim when the env vars are set", () => {
    const config = readAiConfig({
      AI_PROVIDER: "qwen",
      QWEN_BASE_URL: "https://api.gapgpt.app/v1",
      QWEN_MODEL: "gapgpt-qwen-3.6",
    });

    expect(config.provider).toBe("qwen");
    expect(config.baseUrl).toBe("https://api.gapgpt.app/v1");
    expect(config.model).toBe("gapgpt-qwen-3.6");
  });

  it("falls back to DEFAULT_AI_BASE_URL for a whitespace-only QWEN_BASE_URL", () => {
    expect(readAiConfig({ QWEN_BASE_URL: "   " }).baseUrl).toBe(DEFAULT_AI_BASE_URL);
  });

  it("still honours a custom QWEN_MODEL (the model stays configurable)", () => {
    expect(readAiConfig({ QWEN_MODEL: "custom-model" }).model).toBe("custom-model");
  });

  it("reports the missing API key (not the base URL) when only the key is absent", () => {
    const provider = createAIProvider(
      readAiConfig({ QWEN_BASE_URL: "https://api.gapgpt.app/v1", QWEN_MODEL: "gapgpt-qwen-3.6" }),
    );

    expect(provider.isAvailable()).toBe(false);
    expect(provider.unavailableReason()).toContain("QWEN_API_KEY");
    expect(provider.unavailableReason()).not.toContain("QWEN_BASE_URL");
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

    for (const axis of PROFILE_AXES) {
      expect(AI_WRITABLE_DIMENSIONS).not.toContain(axis);
    }
  });
});
