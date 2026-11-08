import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The AI ceilings are a COST control, so batch 13's fail-open default is the
 * wrong direction for them: during a database outage the caps must not vanish.
 *
 * `checkRateLimit` is the REAL module in this file — only the database beneath
 * it is broken — so these cases pin the fail-closed wiring inside
 * `createControlledAIProvider` rather than a mock's opinion of it.
 */
const db = vi.hoisted(() => ({ reachable: false }));

vi.mock("@/lib/db", () => ({
  getPrisma: () => {
    if (!db.reachable) {
      throw new Error("database unreachable");
    }

    return {
      $queryRaw: async () => [{ count: 1 }],
      rateLimitCounter: { deleteMany: async () => ({ count: 0 }) },
    };
  },
}));

import { createControlledAIProvider, resetAiControlsForTests } from "@/lib/ai/cost-controls";
import { AiUnavailableError } from "@/lib/ai/errors";
import type { AIProvider } from "@/lib/ai/provider";
import { makeExplanationInput } from "./fixtures";

const providerWith = (
  call: AIProvider["generateRecommendationExplanation"],
): AIProvider => ({
  id: "test-fail-closed",
  isAvailable: () => true,
  unavailableReason: () => null,
  generatePerfumeProfile: vi.fn(),
  generateRecommendationExplanation: call,
});

const input = makeExplanationInput();

beforeEach(() => {
  db.reachable = false;
  resetAiControlsForTests(0);
});

describe("AI cost ceilings fail closed", () => {
  it("refuses generation when the limiter cannot reach its database", async () => {
    const call = vi.fn().mockResolvedValue({ perfumeId: "p", explanation: "توضیح" });
    const controlled = createControlledAIProvider(providerWith(call), "store-A", () => 0);

    const error = await controlled
      .generateRecommendationExplanation(input)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AiUnavailableError);
    // Identical to a ceiling breach: the caller only sees "no AI right now".
    expect((error as Error).message).toBe("AI usage temporarily unavailable.");
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses a storeless (global-only) generation the same way", async () => {
    const call = vi.fn().mockResolvedValue({ perfumeId: "p", explanation: "توضیح" });
    const controlled = createControlledAIProvider(providerWith(call), undefined, () => 0);

    await expect(
      controlled.generateRecommendationExplanation(input),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    expect(call).not.toHaveBeenCalled();
  });

  it("generates normally while the limiter's database is healthy", async () => {
    db.reachable = true;
    const call = vi.fn().mockResolvedValue({ perfumeId: "p", explanation: "توضیح" });
    const controlled = createControlledAIProvider(providerWith(call), "store-A", () => 0);

    await expect(
      controlled.generateRecommendationExplanation(input),
    ).resolves.toEqual({ perfumeId: "p", explanation: "توضیح" });
    expect(call).toHaveBeenCalledTimes(1);
  });
});
