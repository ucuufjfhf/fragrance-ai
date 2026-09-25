import { beforeEach, describe, expect, it } from "vitest";

import {
  PUBLIC_RATE_LIMITS,
  checkRateLimit,
  clearRateLimit,
  rateLimitResponse,
  requesterIdentity,
  resetRateLimitsForTests,
} from "@/lib/rate-limit";

beforeEach(() => resetRateLimitsForTests());

describe("checkRateLimit", () => {
  it("allows requests through the limit and blocks the next request", () => {
    const policy = { limit: 2, windowMs: 1_000 };

    expect(checkRateLimit("a", policy, 0).allowed).toBe(true);
    expect(checkRateLimit("a", policy, 0).allowed).toBe(true);

    const blocked = checkRateLimit("a", policy, 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("returns the correct Retry-After and resets after the fixed window", () => {
    const policy = { limit: 1, windowMs: 10_000 };

    expect(checkRateLimit("a", policy, 0).allowed).toBe(true);
    expect(checkRateLimit("a", policy, 1_001).retryAfterSeconds).toBe(9);
    expect(checkRateLimit("a", policy, 10_000).allowed).toBe(true);
  });

  it("isolates keys and clears a successful identity", () => {
    expect(checkRateLimit("a", { limit: 1, windowMs: 1_000 }, 0).allowed).toBe(true);
    expect(checkRateLimit("b", { limit: 1, windowMs: 1_000 }, 0).allowed).toBe(true);

    clearRateLimit("a");
    expect(checkRateLimit("a", { limit: 1, windowMs: 1_000 }, 0).allowed).toBe(true);
  });

  it("fails open for invalid timing or policy and emits a valid 429 helper", async () => {
    expect(checkRateLimit("a", { limit: 0, windowMs: 0 }, 0).allowed).toBe(true);
    expect(checkRateLimit("a", { limit: 1, windowMs: 1_000 }, Number.NaN).allowed).toBe(true);

    const response = rateLimitResponse(7, { ok: false, error: "RATE_LIMITED" });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    expect(await response.json()).toEqual({ ok: false, error: "RATE_LIMITED" });
  });
});

describe("requesterIdentity", () => {
  it("uses the first proxy hop and bounds untrusted values", () => {
    const request = new Request("https://app.test", {
      headers: { "x-forwarded-for": "  203.0.113.5, proxy " },
    });
    expect(requesterIdentity(request)).toBe("203.0.113.5");
    expect(requesterIdentity(new Request("https://app.test"))).toBe("unknown");
    expect(requesterIdentity(new Request("https://app.test", {
      headers: { "x-forwarded-for": "a".repeat(200) },
    }))).toHaveLength(128);
  });

  it("defines the approved public policies", () => {
    expect(PUBLIC_RATE_LIMITS).toMatchObject({
      widgetRequester: { limit: 10, windowMs: 60_000 },
      widgetStore: { limit: 30, windowMs: 60_000 },
      eventsRequester: { limit: 120, windowMs: 60_000 },
      quizRequester: { limit: 30, windowMs: 60_000 },
      adminUnlock: { limit: 5, windowMs: 900_000 },
    });
  });
});
