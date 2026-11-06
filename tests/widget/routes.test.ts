import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 8 route-handler tests (spec §33, store isolation + recommendation API)
 * with mocked Prisma/engine modules — no live DB. The handlers are called as
 * plain functions with constructed Requests, exactly as Next.js would.
 */

const rateCounts = new Map<string, number>();
vi.mock("@/lib/rate-limit", () => ({
  PUBLIC_RATE_LIMITS: { widgetRequester: { limit: 10, windowMs: 60_000 }, widgetStore: { limit: 30, windowMs: 60_000 }, eventsRequester: { limit: 120, windowMs: 60_000 }, quizRequester: { limit: 30, windowMs: 60_000 }, adminUnlock: { limit: 5, windowMs: 900_000 } },
  checkRateLimit: vi.fn(async (key: string, policy: { limit: number }) => { const n = (rateCounts.get(key) ?? 0) + 1; rateCounts.set(key, n); return { allowed: n <= policy.limit, retryAfterSeconds: 1 }; }),
  rateLimitResponse: vi.fn((retryAfterSeconds: number, body: unknown, headers: Record<string, string> = {}) => Response.json(body, { status: 429, headers: { ...headers, "Retry-After": String(retryAfterSeconds) } })),
  requesterIdentity: vi.fn(() => "test-requester"),
  resetRateLimitsForTests: vi.fn(() => rateCounts.clear()),
  clearRateLimit: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  storeFindFirst: vi.fn(),
  perfumeFindMany: vi.fn(),
  // The route's own store-scoped price lookup (distinct from the inventory
  // repository mock above, which stands in for getEligiblePerfumesForStore).
  priceFindMany: vi.fn(),
  matchPerfumes: vi.fn(),
  createAIProvider: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    store: { findFirst: mocks.storeFindFirst },
    perfume: { findMany: mocks.priceFindMany },
  }),
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
import { widgetCorsHeaders } from "@/lib/widget/cors";
import { resetRateLimitsForTests } from "@/lib/rate-limit";

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
  resetRateLimitsForTests();
  mocks.storeFindFirst.mockResolvedValue({
    name: "فروشگاه نمونه",
    websiteUrl: "https://shop.example",
    logoUrl: "https://shop.example/logo.png",
    // Stored upper-case on purpose: the payload must carry the normalised form.
    accentColor: "#1F6F5C",
  });
  mocks.priceFindMany.mockResolvedValue([]);
  mocks.createAIProvider.mockReturnValue({ isAvailable: () => false });
});

describe("widget CORS", () => {
  it("allows only the configured store origin", () => {
    expect(widgetCorsHeaders("https://shop.example", "https://shop.example") ["Access-Control-Allow-Origin"]).toBe("https://shop.example");
    expect(widgetCorsHeaders("https://evil.example", "https://shop.example")["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(widgetCorsHeaders("https://shop.example", null)["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(widgetCorsHeaders("http://localhost:3000", "http://localhost:3000")["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
    expect(widgetCorsHeaders("http://127.0.0.1:3000", "http://127.0.0.1:3000")["Access-Control-Allow-Origin"]).toBe("http://127.0.0.1:3000");
    expect(widgetCorsHeaders("http://localhost:3001", "http://localhost:3000")["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(widgetCorsHeaders("https://other.example", "https://shop.example")["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
describe("GET /api/widget/config — store validation (§11)", () => {
  it("returns customer-safe config for an active store", async () => {
    const response = await configGet(new Request("https://app.test/api/widget/config?storeId=store-A"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      config: {
        storeId: "store-A",
        storeName: "فروشگاه نمونه",
        logoUrl: "https://shop.example/logo.png",
        // The merchant's own site — the fallback CTA's destination.
        websiteUrl: "https://shop.example",
        // Normalised to lower case by the canonical rule.
        accentColor: "#1f6f5c",
        active: true,
      },
    });
    expect(mocks.storeFindFirst).toHaveBeenCalledWith({
      where: { id: "store-A", active: true },
      select: { name: true, websiteUrl: true, logoUrl: true, accentColor: true },
    });
  });

  it("keeps the payload minimal — id, name, logo and active only", async () => {
    const response = await configGet(new Request("https://app.test/api/widget/config?storeId=store-A"));
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(["config", "ok"]);
    expect(Object.keys(body.config).sort()).toEqual([
      "accentColor", "active", "logoUrl", "storeId", "storeName", "websiteUrl",
    ]);
    // The slug, timestamps and the rest of the Store row stay server-side.
    expect(JSON.stringify(body)).not.toContain("createdAt");
    expect(JSON.stringify(body)).not.toContain("slug");
  });

  it("falls back to the default accent when the stored colour is absent or invalid", async () => {
    for (const stored of [null, "chartreuse", "#12345"]) {
      mocks.storeFindFirst.mockResolvedValue({
        name: "فروشگاه نمونه",
        websiteUrl: "https://shop.example",
        logoUrl: null,
        accentColor: stored,
      });

      const response = await configGet(new Request("https://app.test/api/widget/config?storeId=store-A"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.config.accentColor).toBeNull();
    }
  });

  it("reports a null logo when the merchant has not set one", async () => {
    mocks.storeFindFirst.mockResolvedValue({
      name: "فروشگاه نمونه",
      websiteUrl: null,
      logoUrl: null,
    });

    const response = await configGet(new Request("https://app.test/api/widget/config?storeId=store-A"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.config.logoUrl).toBeNull();
    // Name-only stores still work: the name is always present.
    expect(body.config.storeName).toBe("فروشگاه نمونه");
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

  it("applies the stricter requester limit and preserves CORS and AI fallback", async () => {
    mocks.matchPerfumes.mockReturnValue(makeMatchResult("store-A", 1));
    const post = () => recommendPost(new Request("https://app.test/api/widget/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://shop.example", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({ storeId: "store-A", personalityVector: VECTOR }),
    }));

    for (let index = 0; index < 10; index += 1) {
      const normal = await post();
      expect(normal.status).toBe(200);
      expect((await normal.json()).aiAvailable).toBe(false);
    }

    const limited = await post();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/);
    expect(limited.headers.get("Access-Control-Allow-Origin")).toBe("https://shop.example");
    expect((await limited.json()).reason).toBe("RATE_LIMITED");
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
      "brand", "imageUrl", "matchPercent", "name", "perfumeId", "price", "productUrl", "rank",
    ]);
    expect(first.explanation).toBeUndefined();
    expect(first.perfumeId).toBe("store-A-perfume-1"); // minimum identifier (§12)
  });

  it("includes each perfume's stored price, and null when there is none", async () => {
    mocks.matchPerfumes.mockReturnValue(makeMatchResult("store-A", 2));
    mocks.priceFindMany.mockResolvedValue([
      { id: "store-A-perfume-1", price: 890_000 },
      { id: "store-A-perfume-2", price: null },
    ]);

    const response = await recommendPost(
      new Request("https://app.test/api/widget/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: "store-A", personalityVector: VECTOR }),
      }),
    );

    const body = await response.json();

    expect(body.recommendations[0].price).toBe(890_000);
    expect(body.recommendations[1].price).toBeNull();
    // The price lookup is store-scoped, like every other widget read.
    expect(mocks.priceFindMany).toHaveBeenCalledWith({
      where: { storeId: "store-A", id: { in: ["store-A-perfume-1", "store-A-perfume-2"] } },
      select: { id: true, price: true },
    });
  });

  it("still returns the recommendations when the price lookup fails", async () => {
    mocks.matchPerfumes.mockReturnValue(makeMatchResult("store-A", 1));
    mocks.priceFindMany.mockRejectedValue(new Error("connection refused"));

    const response = await recommendPost(
      new Request("https://app.test/api/widget/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: "store-A", personalityVector: VECTOR }),
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.recommendations).toHaveLength(1);
    expect(body.recommendations[0].price).toBeNull();
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
