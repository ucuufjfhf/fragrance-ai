import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ counts: new Map<string, number>(), fail: false }));
vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      if (dbMocks.fail) throw new Error("database unavailable");
      const key = `${String(values[0])}:${String(values[1])}`;
      const count = (dbMocks.counts.get(key) ?? 0) + 1;
      dbMocks.counts.set(key, count);
      return [{ count }];
    },
    rateLimitCounter: { deleteMany: vi.fn(async ({ where }: { where: { key?: string } }) => {
      if (where.key) for (const key of dbMocks.counts.keys()) if (key.startsWith(`${where.key}:`)) dbMocks.counts.delete(key);
      return { count: 0 };
    }) },
  }),
}));

import {
  PUBLIC_RATE_LIMITS,
  checkRateLimit,
  clearRateLimit,
  rateLimitResponse,
  requesterIdentity,
  resetRateLimitsForTests,
} from "@/lib/rate-limit";

beforeEach(() => {
  dbMocks.counts.clear();
  dbMocks.fail = false;
  resetRateLimitsForTests();
});

describe("checkRateLimit", () => {
  it("allows requests through the limit and blocks the next request", async () => {
    const policy = { limit: 2, windowMs: 1_000 };

    expect((await checkRateLimit("a", policy, 0)).allowed).toBe(true);
    expect((await checkRateLimit("a", policy, 0)).allowed).toBe(true);

    const blocked = await checkRateLimit("a", policy, 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("returns the correct Retry-After and resets after the fixed window", async () => {
    const policy = { limit: 1, windowMs: 10_000 };

    expect((await checkRateLimit("a", policy, 0)).allowed).toBe(true);
    expect((await checkRateLimit("a", policy, 1_001)).retryAfterSeconds).toBe(9);
    expect((await checkRateLimit("a", policy, 10_000)).allowed).toBe(true);
  });

  it("isolates keys and clears a successful identity", async () => {
    expect((await checkRateLimit("a", { limit: 1, windowMs: 1_000 }, 0)).allowed).toBe(true);
    expect((await checkRateLimit("b", { limit: 1, windowMs: 1_000 }, 0)).allowed).toBe(true);

    await clearRateLimit("a");
    expect((await checkRateLimit("a", { limit: 1, windowMs: 1_000 }, 0)).allowed).toBe(true);
  });

  it("fails open for invalid timing or policy and emits a valid 429 helper", async () => {
    expect((await checkRateLimit("a", { limit: 0, windowMs: 0 }, 0)).allowed).toBe(true);
    expect((await checkRateLimit("a", { limit: 1, windowMs: 1_000 }, Number.NaN)).allowed).toBe(true);

    const response = rateLimitResponse(7, { ok: false, error: "RATE_LIMITED" });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    expect(await response.json()).toEqual({ ok: false, error: "RATE_LIMITED" });
  });

  it("fails open by default when the counter database is unreachable", async () => {
    dbMocks.fail = true;

    // Public endpoints depend on this: a limiter outage must not break the shop.
    expect(await checkRateLimit("a", { limit: 5, windowMs: 900_000 }, 0)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("fails closed when the caller opts in and the database is unreachable", async () => {
    dbMocks.fail = true;

    // The admin unlock opts in: no counter, no attempt.
    expect(await checkRateLimit("a", { limit: 5, windowMs: 900_000 }, 0, { failClosed: true })).toEqual({
      allowed: false,
      // One full policy window, so the client retries after it, not immediately.
      retryAfterSeconds: 900,
    });
  });

  it("still allows and still blocks normally in fail-closed mode while the database works", async () => {
    const policy = { limit: 1, windowMs: 60_000 };

    expect((await checkRateLimit("a", policy, 0, { failClosed: true })).allowed).toBe(true);
    expect((await checkRateLimit("a", policy, 0, { failClosed: true })).allowed).toBe(false);
  });
});

describe("requesterIdentity", () => {
  const identity = (headers: Record<string, string>) =>
    requesterIdentity(new Request("https://app.test", { headers }));

  it("prefers Netlify's edge-set client IP, which a client cannot forge", () => {
    expect(identity({
      "x-nf-client-connection-ip": "198.51.100.7",
      "x-forwarded-for": "203.0.113.5, 10.0.0.1",
      "x-real-ip": "192.0.2.9",
    })).toBe("198.51.100.7");
  });

  it("falls back to the nearest proxy hop, not the client-supplied first entry", () => {
    expect(identity({ "x-forwarded-for": "203.0.113.5, 198.51.100.7" })).toBe("198.51.100.7");
    expect(identity({ "x-forwarded-for": "  203.0.113.5 ,  198.51.100.7  " })).toBe("198.51.100.7");
  });

  it("cannot be reset by rotating the first X-Forwarded-For entry", () => {
    // The spoofing this batch closes: the leftmost entry was the key.
    const first = identity({ "x-forwarded-for": "203.0.113.5, 198.51.100.7" });
    const second = identity({ "x-forwarded-for": "203.0.113.99, 198.51.100.7" });

    expect(first).toBe(second);
  });

  it("uses x-real-ip when no other source is present", () => {
    expect(identity({ "x-real-ip": "192.0.2.9" })).toBe("192.0.2.9");
  });

  it("never turns an unusable value into a key", () => {
    expect(identity({})).toBe("unknown");
    expect(identity({ "x-forwarded-for": "not an ip" })).toBe("unknown");
    expect(identity({ "x-nf-client-connection-ip": "bad value!" })).toBe("unknown");
    // A malformed preferred header falls through to the next source.
    expect(identity({ "x-nf-client-connection-ip": "bad value!", "x-real-ip": "192.0.2.9" })).toBe("192.0.2.9");
  });

  it("bounds untrusted values", () => {
    expect(identity({ "x-forwarded-for": "a".repeat(200) })).toHaveLength(128);
  });

  it("defines the approved public policies", () => {
    expect(PUBLIC_RATE_LIMITS).toMatchObject({
      widgetRequester: { limit: 10, windowMs: 60_000 },
      widgetStore: { limit: 30, windowMs: 60_000 },
      eventsRequester: { limit: 120, windowMs: 60_000 },
      // The two brakes added for buyer audit round 6.
      eventsStore: { limit: 600, windowMs: 60_000 },
      // Recalibrated in batch 16: CGNAT puts hundreds of shoppers on one IP.
      configRequester: { limit: 300, windowMs: 60_000 },
      quizRequester: { limit: 30, windowMs: 60_000 },
      adminUnlock: { limit: 5, windowMs: 900_000 },
    });
  });
});
