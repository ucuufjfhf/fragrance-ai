import { beforeEach, describe, expect, it, vi } from "vitest";

const quota = vi.hoisted(() => ({ counts: new Map<string, number>(), limits: new Map<string, number>() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async (key: string, policy: { limit: number }) => {
    const count = (quota.counts.get(key) ?? 0) + 1;
    quota.counts.set(key, count);
    quota.limits.set(key, policy.limit);
    return { allowed: count <= policy.limit, retryAfterSeconds: 1 };
  }),
}));
import { createControlledAIProvider, getAiControlState, readAiControlPolicy, resetAiControlsForTests } from "@/lib/ai/cost-controls";
import type { AIProvider } from "@/lib/ai/provider";
import { makeExplanationInput } from "../ai/fixtures";

const provider = (impl: AIProvider["generateRecommendationExplanation"]): AIProvider => ({
  id: "test", isAvailable: () => true, unavailableReason: () => null,
  generatePerfumeProfile: vi.fn(), generateRecommendationExplanation: impl,
});
const input = makeExplanationInput();
beforeEach(() => { quota.counts.clear(); quota.limits.clear(); resetAiControlsForTests(0); });

describe("AI cost controls", () => {
  it("uses safe defaults when optional environment values are absent", () => {
    expect(readAiControlPolicy({})).toEqual({ globalRequestLimit: 1000, storeRequestLimit: 200, usageWindowMs: 60000, circuitFailureThreshold: 5, circuitCooldownMs: 60000 });
  });
  it("records successful usage per store and blocks only that store", async () => {
    vi.stubEnv("AI_STORE_REQUEST_LIMIT_PER_WINDOW", "1");
    resetAiControlsForTests(0);
    const call = vi.fn().mockResolvedValue({ perfumeId: "p", explanation: "توضیح" });
    const a = createControlledAIProvider(provider(call), "A", () => 0);
    const b = createControlledAIProvider(provider(call), "B", () => 0);
    await a.generateRecommendationExplanation(input);
    await expect(a.generateRecommendationExplanation(input)).rejects.toThrow();
    await b.generateRecommendationExplanation(input);
    expect(quota.counts.get("ai:store:A")).toBe(2);
    vi.unstubAllEnvs();
  });
  it("opens after threshold, allows one half-open trial, and closes on success", async () => {
    vi.stubEnv("AI_CIRCUIT_FAILURE_THRESHOLD", "1"); vi.stubEnv("AI_CIRCUIT_COOLDOWN_MS", "100"); resetAiControlsForTests(0);
    const call = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue({ perfumeId: "p", explanation: "توضیح" });
    const controlled = createControlledAIProvider(provider(call), "A", () => 0);
    await expect(controlled.generateRecommendationExplanation(input)).rejects.toThrow();
    expect(getAiControlState().circuitState).toBe("OPEN");
    await expect(controlled.generateRecommendationExplanation(input)).rejects.toThrow();
    const now = () => 100;
    const trial = createControlledAIProvider(provider(call), "A", now);
    await trial.generateRecommendationExplanation(input);
    expect(getAiControlState().circuitState).toBe("CLOSED");
    vi.unstubAllEnvs();
  });
});
