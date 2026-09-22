import { describe, expect, it, vi } from "vitest";

import { generateExplanation } from "@/lib/ai/explanation";
import { enrichPerfumeProfile } from "@/lib/ai/perfume-profile";
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
    model: "qwen3.6",
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
    expect(calls[0].body.model).toBe("qwen3.6");
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
      model: "qwen3.6",
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
