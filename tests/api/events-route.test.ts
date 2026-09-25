import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ record: vi.fn() }));
const rateCounts = new Map<string, number>();
vi.mock("@/lib/db", () => ({ getPrisma: () => ({
  $queryRaw: async (_s: TemplateStringsArray, ...v: unknown[]) => { const k = String(v[0]); const n = (rateCounts.get(k) ?? 0) + 1; rateCounts.set(k, n); return [{ count: n }]; },
  rateLimitCounter: { deleteMany: vi.fn() },
}) }));
vi.mock("@/lib/analytics/service", () => ({ recordAnalyticsEvent: mocks.record }));

import { POST } from "@/app/api/events/route";
import { resetRateLimitsForTests } from "@/lib/rate-limit";

beforeEach(() => {
  rateCounts.clear();
  vi.clearAllMocks();
  resetRateLimitsForTests();
  mocks.record.mockResolvedValue({ ok: true });
});

const request = (): Request => new Request("https://app.test/api/events", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.77" },
  body: JSON.stringify({ eventType: "QUIZ_STARTED" }),
});

describe("POST /api/events rate limiting", () => {
  it("preserves 202 success below the limit and returns 429 above it", async () => {
    for (let index = 0; index < 120; index += 1) {
      expect((await POST(request())).status).toBe(202);
    }

    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/);
    expect((await response.json()).error).toBe("RATE_LIMITED");
    expect(mocks.record).toHaveBeenCalledTimes(120);
  });
});
