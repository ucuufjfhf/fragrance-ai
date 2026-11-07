import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The store-scoped events brake (buyer audit round 6).
 *
 * POST /api/events used to carry only the requester limit, so one source could
 * inflate a merchant's numbers by rotating identities — the storeId it writes
 * to is public in the embed snippet. The route now also counts
 * `events:store:<storeId>` at 600/min.
 *
 * This suite keeps the REAL limiter (and its SQL-shaped mock below) and only
 * shrinks the store policy, so the route's ordering and key shape are what gets
 * exercised, not a stubbed allow/deny.
 */

const dbMocks = vi.hoisted(() => ({ counts: new Map<string, number>() }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({
  $queryRaw: async (_s: TemplateStringsArray, ...v: unknown[]) => {
    const key = String(v[0]);
    const count = (dbMocks.counts.get(key) ?? 0) + 1;
    dbMocks.counts.set(key, count);
    return [{ count }];
  },
  rateLimitCounter: { deleteMany: vi.fn() },
}) }));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    PUBLIC_RATE_LIMITS: { ...actual.PUBLIC_RATE_LIMITS, eventsStore: { limit: 2, windowMs: 60_000 } },
  };
});

const mocks = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/lib/analytics/service", () => ({ recordAnalyticsEvent: mocks.record }));

import { POST } from "@/app/api/events/route";

beforeEach(() => {
  dbMocks.counts.clear();
  vi.clearAllMocks();
  mocks.record.mockResolvedValue({ ok: true });
});

/** Each call comes from a different requester, so only the store cap can trip. */
const event = (storeId: string | undefined, requester: string): Request =>
  new Request("https://app.test/api/events", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": requester },
    body: JSON.stringify({ eventType: "QUIZ_STARTED", ...(storeId ? { storeId } : {}) }),
  });

describe("POST /api/events store cap", () => {
  it("caps a store's events even when the requester rotates", async () => {
    expect((await POST(event("store-A", "203.0.113.1"))).status).toBe(202);
    expect((await POST(event("store-A", "203.0.113.2"))).status).toBe(202);

    const limited = await POST(event("store-A", "203.0.113.3"));

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/);
    expect(await limited.json()).toEqual({ ok: false, error: "RATE_LIMITED" });
    // The over-limit event never reaches the writer.
    expect(mocks.record).toHaveBeenCalledTimes(2);
  });

  it("gives each store its own budget", async () => {
    await POST(event("store-A", "203.0.113.1"));
    await POST(event("store-A", "203.0.113.2"));

    // store-A is now at its cap; store-B is untouched.
    expect((await POST(event("store-B", "203.0.113.3"))).status).toBe(202);
  });

  it("leaves storeless events on the requester check alone", async () => {
    for (const requester of ["203.0.113.1", "203.0.113.2", "203.0.113.3", "203.0.113.4"]) {
      expect((await POST(event(undefined, requester))).status).toBe(202);
    }

    expect(mocks.record).toHaveBeenCalledTimes(4);
    expect([...dbMocks.counts.keys()].some((key) => key.startsWith("events:store:"))).toBe(false);
  });

  it("does not mint a store key from a malformed store id", async () => {
    const response = await POST(event("not a valid id!", "203.0.113.1"));

    // With the writer mocked here, the assertion is key hygiene: a malformed id must never become a limiter key.
    expect(response.status).toBe(202);
    expect([...dbMocks.counts.keys()].some((key) => key.startsWith("events:store:"))).toBe(false);
  });
});
