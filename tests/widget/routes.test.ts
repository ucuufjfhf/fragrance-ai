import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 8 route-handler tests (spec §33, store isolation + recommendation API)
 * with mocked Prisma/engine modules — no live DB. The handlers are called as
 * plain functions with constructed Requests, exactly as Next.js would.
 */

const mocks = vi.hoisted(() => ({
  storeFindFirst: vi.fn(),
  perfumeFindMany: vi.fn(),
  matchPerfumes: vi.fn(),
  createAIProvider: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({ store: { findFirst: mocks.storeFindFirst } }),
}));

vi.mock("@/lib/matching/repository", () => ({
  getEligiblePerfumesForStore: (storeId: string) => {
    // The real repository scopes by storeId — model that behaviour.
    return mocks.perfumeFindMany({ where: { storeId } });
  },
}));

vi.mock("@/lib/matching/engine", () => ({
  matchPerfumes: mocks.matchPerfumes,
}));

vi.mock("@/lib/ai/provider", () => ({
  createAIProvider: mocks.createAIProvider,
}));

vi.mock("@/lib/ai/explanation", () => ({
  generateExplanations: vi.fn().mockResolvedValue(new Map()),
  selectUserTraits: vi.fn().mockReturnValue([]),
}));

import { GET as configGet } from "@/app/api/widget/config/route";
import { POST as recommendPost } from "@/app/api/widget/recommend/route";
import type { MatchResult } from "@/types/recommendation";

const VECTOR = {
  social: 60, adventurous: 40, expressive: 55, mysterious: 70, fresh: 30,
  warm: 65, experimental: 45, elegant: 80, bold: 50,
};

function makeMatchResult(storeId: string, count: number): MatchResult {
  return {
    recommendations: Array.from({ length: count }, (_, index) => ({
      rank: index + 1,
      perfumeId: `${storeId}-perfume-${index + 1}`,
      storeId,
      name: `عطر ${index + 1}`,
      brand: "برند",
      slug: null,
      productUrl: `https://shop.example.com/p/${index + 1}`,
      imageUrl: null,
      distance: 90 - index,
      score: 70 - index,
      presentationScore: 70 - index,
    })),
    excluded: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storeFindFirst.mockResolvedValue({ name: "فروشگاه نمونه" });
  mocks.createAIProvider.mockReturnValue({ isAvailable: () => false });
});

describe("GET /api/widget/config — store validation (§11)", () => {
  it("returns customer-safe config for an active store", async () => {
    const response = await configGet(new Request("https://app.test/api/widget/config?storeId=store-A"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      config: { storeId: "store-A", storeName: "فروشگاه نمونه", active: true },
    });
    expect(mocks.storeFindFirst).toHaveBeenCalledWith({
      where: { id: "store-A", active: true },
      select: { name: true },
    });
  });

  it("rejects a malformed store id before touching the DB", async () => {
    const response = await configGet(new Request("https://app.test/api/widget/config?storeId=bad%20id"));

    expect(response.status).toBe(400);
    expect(mocks.storeFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an unknown store without disclosing others", async () => {
    mocks.storeFindFirst.mockResolvedValue(null);
    const response = await configGet(new Request("https://app.test/api/widget/config?storeId=store-nope"));

    expect(response.status).toBe(404);
  });

  it("treats an inactive store as unavailable", async () => {
    // The where clause itself demands active: true.
    mocks.storeFindFirst.mockResolvedValue(null);
    const response = await configGet(new Request("https://app.test/api/widget/config?storeId=store-A"));

    expect(response.status).toBe(404);
    expect(mocks.storeFindFirst.mock.calls[0][0].where.active).toBe(true);
  });
});

describe("POST /api/widget/recommend — store isolation (§4/§13)", () => {
  it("loads inventory ONLY for the validated store id", async () => {
    mocks.matchPerfumes.mockReturnValue(makeMatchResult("store-A", 3));

    const response = await recommendPost(
      new Request("https://app.test/api/widget/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: "store-A", personalityVector: VECTOR }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.perfumeFindMany).toHaveBeenCalledWith({ where: { storeId: "store-A" } });

    const body = await response.json();

    for (const recommendation of body.recommendations) {
      expect(recommendation.perfumeId.startsWith("store-A")).toBe(true);
    }
  });

  it("rejects an unknown store before loading any inventory", async () => {
    mocks.storeFindFirst.mockResolvedValue(null);

    const response = await recommendPost(
      new Request("https://app.test/api/widget/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: "store-x", personalityVector: VECTOR }),
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.perfumeFindMany).not.toHaveBeenCalled();
    expect(mocks.matchPerfumes).not.toHaveBeenCalled();
  });

  it("rejects an invalid personality vector (browser never trusted)", async () => {
    const response = await recommendPost(
      new Request("https://app.test/api/widget/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: "store-A", personalityVector: { social: 50 } }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.matchPerfumes).not.toHaveBeenCalled();
  });

  it("passes the engine the validated vector untouched (no local scoring, §13)", async () => {
    mocks.matchPerfumes.mockReturnValue(makeMatchResult("store-A", 2));

    await recommendPost(
      new Request("https://app.test/api/widget/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: "store-A", personalityVector: VECTOR }),
      }),
    );

    const call = mocks.matchPerfumes.mock.calls[0][0];

    expect(call.personalityVector).toEqual(VECTOR);
    expect(call.storeId).toBe("store-A");
  });
});

describe("POST /api/widget/recommend — response contract (§12)", () => {
  it("returns only customer-safe fields, in engine rank order", async () => {
    mocks.matchPerfumes.mockReturnValue(makeMatchResult("store-A", 3));

    const response = await recommendPost(
      new Request("https://app.test/api/widget/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: "store-A", personalityVector: VECTOR }),
      }),
    );

    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.aiAvailable).toBe(false); // mocked provider unavailable → fallback
    expect(body.recommendations.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 3]);

    const first = body.recommendations[0];

    // `explanation` is absent when the AI is unavailable (JSON drops undefined).
    expect(Object.keys(first).sort()).toEqual([
      "brand", "imageUrl", "matchPercent", "name", "perfumeId", "productUrl", "rank",
    ]);
    expect(first.explanation).toBeUndefined();
    expect(first.perfumeId).toBe("store-A-perfume-1"); // minimum identifier (§12)
  });

  it("empty inventory returns an empty recommendation list, not an error", async () => {
    mocks.matchPerfumes.mockReturnValue(makeMatchResult("store-A", 0));

    const response = await recommendPost(
      new Request("https://app.test/api/widget/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: "store-A", personalityVector: VECTOR }),
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recommendations).toEqual([]);
  });

  it("AI failure still returns the full deterministic list (§14/§39)", async () => {
    mocks.matchPerfumes.mockReturnValue(makeMatchResult("store-A", 2));
    mocks.createAIProvider.mockReturnValue({ isAvailable: () => true });

    const response = await recommendPost(
      new Request("https://app.test/api/widget/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: "store-A", personalityVector: VECTOR }),
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recommendations).toHaveLength(2);
  });
});
