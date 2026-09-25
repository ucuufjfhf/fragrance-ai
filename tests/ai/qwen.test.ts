import { describe, expect, it, vi } from "vitest";

import { generateExplanation } from "@/lib/ai/explanation";
import { enrichPerfumeProfile } from "@/lib/ai/perfume-profile";
import {
  AiUnavailableError,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  createAIProvider,
} from "@/lib/ai/provider";
import { createQwenProvider } from "@/lib/ai/qwen";
import { makeExplanationInput, makeProfileInput } from "./fixtures";

/**
 * Transport tests for the Qwen/GaptGPT provider.
 *
 * No network: `fetch` is injected. No real credentials: the key below is a fake
 * literal, and a test asserts it never appears in error messages.
 */

const TEST_KEY = "test-key";
const BASE_URL = "https://ai.example/v1";

interface CapturedCall {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

function jsonResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A model reply the validators accept (Persian, no digits, correct length). */
const VALID_EXPLANATION_JSON = JSON.stringify({
  explanation:
    "این عطر با سلیقه گرم و مرموز تو هماهنگه و همون حس خاصی که دنبالش هستی رو منتقل می‌کنه.",
});

function createProvider(fetchImpl: typeof fetch, timeoutMs = 5_000) {
  return createQwenProvider({
    apiKey: TEST_KEY,
    baseUrl: BASE_URL,
    model: DEFAULT_AI_MODEL,
    timeoutMs,
    fetchImpl,
  });
}

function captureFetch(content: string, status = 200) {
  const calls: CapturedCall[] = [];

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      init: init ?? {},
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });

    return jsonResponse(content, status);
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

describe("qwen provider transport", () => {
  it("posts to {baseUrl}/chat/completions with bearer auth and a small budget", async () => {
    const { fetchImpl, calls } = captureFetch(VALID_EXPLANATION_JSON);
    const outcome = await generateExplanation(
      createProvider(fetchImpl),
      makeExplanationInput(),
    );

    expect(outcome.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE_URL}/chat/completions`);
    expect(calls[0].init.method).toBe("POST");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(calls[0].body.model).toBe(DEFAULT_AI_MODEL);
    expect(calls[0].body.max_tokens).toBeLessThanOrEqual(500);

    const messages = calls[0].body.messages as Array<{
      role: string;
      content: string;
    }>;
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain(makeExplanationInput().perfume.name);
    expect(messages[1].content).not.toMatch(/[0-9]/);
  });

  it("trims a trailing slash from the configured base URL", async () => {
    const { fetchImpl, calls } = captureFetch(VALID_EXPLANATION_JSON);
    const provider = createQwenProvider({
      apiKey: TEST_KEY,
      baseUrl: `${BASE_URL}/`,
      model: DEFAULT_AI_MODEL,
      timeoutMs: 5_000,
      fetchImpl,
    });

    await generateExplanation(provider, makeExplanationInput());

    expect(calls[0].url).toBe(`${BASE_URL}/chat/completions`);
  });

  it("validates enrichment replies through the profile validator", async () => {
    const { fetchImpl } = captureFetch(
      JSON.stringify({ descriptors: { woody: 120, social: 90 } }),
    );

    const outcome = await enrichPerfumeProfile(
      createProvider(fetchImpl),
      makeProfileInput(),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("read-only matching axis");
    }
  });

  it("clamps descriptor replies and returns the input perfume id", async () => {
    const { fetchImpl } = captureFetch(
      JSON.stringify({ descriptors: { woody: 73.6 }, notes: [" عود "] }),
    );

    const outcome = await enrichPerfumeProfile(
      createProvider(fetchImpl),
      makeProfileInput(),
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.perfumeId).toBe(makeProfileInput().perfumeId);
      expect(outcome.value.descriptors.woody).toBe(74);
      expect(outcome.value.notes).toEqual(["عود"]);
    }
  });

  it("extracts JSON that is wrapped in prose", async () => {
    const { fetchImpl } = captureFetch(`Sure!\n${VALID_EXPLANATION_JSON}\nThanks.`);

    const outcome = await generateExplanation(
      createProvider(fetchImpl),
      makeExplanationInput(),
    );

    expect(outcome.ok).toBe(true);
  });

  it("reports HTTP failures without leaking the API key", async () => {
    const { fetchImpl } = captureFetch("upstream unavailable", 503);

    const outcome = await generateExplanation(
      createProvider(fetchImpl),
      makeExplanationInput(),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("503");
      expect(outcome.reason).not.toContain(TEST_KEY);
    }
  });

  it("reports non-JSON replies as response errors", async () => {
    const { fetchImpl } = captureFetch("I cannot answer that.");

    const outcome = await generateExplanation(
      createProvider(fetchImpl),
      makeExplanationInput(),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("JSON");
    }
  });

  it("rejects explanations containing digits (invented scores)", async () => {
    const { fetchImpl } = captureFetch(
      JSON.stringify({
        explanation: "این عطر با سلیقه تو ۹۲ درصد هماهنگه و خیلی خاصه.",
      }),
    );

    const outcome = await generateExplanation(
      createProvider(fetchImpl),
      makeExplanationInput(),
    );

    expect(outcome.ok).toBe(false);
  });

  it("times out and reports it instead of hanging", async () => {
    const hanging = ((_url: string | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      })) as unknown as typeof fetch;

    const spy = vi.fn(hanging);
    const outcome = await generateExplanation(
      createProvider(spy as unknown as typeof fetch, 20),
      makeExplanationInput(),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("timed out");
    }
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("GapGPT endpoint compatibility", () => {
  it("posts to https://api.gapgpt.app/v1/chat/completions with bearer auth and the migrated model", async () => {
    const { fetchImpl, calls } = captureFetch(VALID_EXPLANATION_JSON);
    const provider = createQwenProvider({
      apiKey: TEST_KEY,
      baseUrl: DEFAULT_AI_BASE_URL,
      model: DEFAULT_AI_MODEL,
      timeoutMs: 5_000,
      fetchImpl,
    });

    const outcome = await generateExplanation(provider, makeExplanationInput());

    expect(outcome.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.gapgpt.app/v1/chat/completions");
    expect(calls[0].url).not.toContain("/v1/v1/");
    expect(calls[0].init.method).toBe("POST");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe(`Bearer ${TEST_KEY}`);

    expect(calls[0].body.model).toBe("gapgpt-qwen-3.6");

    const messages = calls[0].body.messages as Array<{ role: string; content: string }>;
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("normalises a trailing slash on the GapGPT base URL without doubling /v1", async () => {
    const { fetchImpl, calls } = captureFetch(VALID_EXPLANATION_JSON);
    const provider = createQwenProvider({
      apiKey: TEST_KEY,
      baseUrl: `${DEFAULT_AI_BASE_URL}/`,
      model: DEFAULT_AI_MODEL,
      timeoutMs: 5_000,
      fetchImpl,
    });

    await generateExplanation(provider, makeExplanationInput());

    expect(calls[0].url).toBe("https://api.gapgpt.app/v1/chat/completions");
  });

  it("extracts content from the OpenAI-compatible choices[0].message.content shape", async () => {
    const { fetchImpl } = captureFetch(VALID_EXPLANATION_JSON);
    const provider = createQwenProvider({
      apiKey: TEST_KEY,
      baseUrl: DEFAULT_AI_BASE_URL,
      model: DEFAULT_AI_MODEL,
      timeoutMs: 5_000,
      fetchImpl,
    });

    const outcome = await generateExplanation(provider, makeExplanationInput());

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.explanation).toContain("عطر");
      expect(outcome.value.perfumeId).toBe(
        makeExplanationInput().recommendation.perfumeId,
      );
    }
  });

  it("reports a malformed (non-JSON) response body as a response error", async () => {
    const fetchImpl = (async () =>
      new Response("<html>bad gateway</html>", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    const outcome = await generateExplanation(
      createProvider(fetchImpl),
      makeExplanationInput(),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("JSON");
    }
  });

  it("never accepts a response that has no message content", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ choices: [{ message: {} }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    const outcome = await generateExplanation(
      createProvider(fetchImpl),
      makeExplanationInput(),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("content");
    }
  });

  it("does not call the endpoint when the API key is missing (unavailable provider)", async () => {
    const provider = createAIProvider({
      provider: "qwen",
      apiKey: "",
      baseUrl: DEFAULT_AI_BASE_URL,
      model: DEFAULT_AI_MODEL,
      timeoutMs: 5_000,
    });

    expect(provider.isAvailable()).toBe(false);
    await expect(
      provider.generateRecommendationExplanation(makeExplanationInput()),
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe("qwen provider — structured error metadata (Phase 12.4)", () => {
  it("attaches the structured HTTP status to a failing response", async () => {
    const fetchImpl = (async () =>
      new Response("too many requests", { status: 429 })) as unknown as typeof fetch;

    const outcome = await enrichPerfumeProfile(
      createProvider(fetchImpl),
      makeProfileInput(),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("HTTP 429");
    }

    // The enrich outcome is data-only, so classify the error shape directly.
    await expect(
      createProvider(fetchImpl).generatePerfumeProfile(makeProfileInput()),
    ).rejects.toMatchObject({ name: "AiRequestError", status: 429, timeout: false });
  });

  it("attaches the structured HTTP 5xx status to a server error", async () => {
    const fetchImpl = (async () =>
      new Response("boom", { status: 503 })) as unknown as typeof fetch;

    await expect(
      createProvider(fetchImpl).generatePerfumeProfile(makeProfileInput()),
    ).rejects.toMatchObject({ name: "AiRequestError", status: 503 });
  });

  it("does not attach a status to a transport failure", async () => {
    const fetchImpl = (async () => {
      throw new Error("socket dropped");
    }) as unknown as typeof fetch;

    await expect(
      createProvider(fetchImpl).generatePerfumeProfile(makeProfileInput()),
    ).rejects.toMatchObject({ name: "AiRequestError", status: null });
  });

  it("classifies an aborted request as a structured timeout", async () => {
    const fetchImpl = (async () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    }) as unknown as typeof fetch;

    await expect(
      createProvider(fetchImpl).generatePerfumeProfile(makeProfileInput()),
    ).rejects.toMatchObject({ name: "AiRequestError", timeout: true, status: null });
  });

  it("parses a delta-seconds Retry-After hint into milliseconds", async () => {
    const fetchImpl = (async () =>
      new Response("slow down", {
        status: 429,
        headers: { "Retry-After": "30" },
      })) as unknown as typeof fetch;

    await expect(
      createProvider(fetchImpl).generatePerfumeProfile(makeProfileInput()),
    ).rejects.toMatchObject({ name: "AiRequestError", status: 429, retryAfterMs: 30_000 });
  });

  it("parses a future HTTP-date Retry-After hint into milliseconds", async () => {
    const future = new Date(Date.now() + 60_000).toUTCString();

    const fetchImpl = (async () =>
      new Response("slow down", {
        status: 429,
        headers: { "Retry-After": future },
      })) as unknown as typeof fetch;

    await expect(
      createProvider(fetchImpl).generatePerfumeProfile(makeProfileInput()),
    ).rejects.toMatchObject({ name: "AiRequestError", status: 429, retryAfterMs: expect.any(Number) });

    // The delay should be positive and roughly 60 s away (not the raw epoch).
    const caught = await createProvider(fetchImpl)
      .generatePerfumeProfile(makeProfileInput())
      .catch((error) => error);

    expect(caught.retryAfterMs).toBeGreaterThan(0);
    expect(caught.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("ignores an invalid Retry-After hint", async () => {
    const fetchImpl = (async () =>
      new Response("slow down", {
        status: 429,
        headers: { "Retry-After": "not-a-date" },
      })) as unknown as typeof fetch;

    await expect(
      createProvider(fetchImpl).generatePerfumeProfile(makeProfileInput()),
    ).rejects.toMatchObject({ name: "AiRequestError", retryAfterMs: null });
  });

  it("keeps the successful JSON response behavior unchanged", async () => {
    const outcome = await enrichPerfumeProfile(
      createProvider(captureFetch(JSON.stringify({ descriptors: { woody: 80, longevity: 70 } })).fetchImpl),
      makeProfileInput(),
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.descriptors).toMatchObject({ woody: 80, longevity: 70 });
    }
  });
});
