import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() }, provider: { isAvailable: vi.fn() } }));
vi.mock("@/lib/db", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("@/lib/ai/provider", () => ({ createAIProvider: () => mocks.provider }));
vi.mock("@/lib/ai/cost-controls", () => ({ getAiControlState: () => ({ circuitState: "CLOSED" }), resetAiControlsForTests: vi.fn() }));

import { GET } from "@/app/api/health/route";
import { resetAiControlsForTests } from "@/lib/ai/cost-controls";

const URL = "https://app.test/api/health";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$queryRaw.mockReset();
  mocks.prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
  mocks.provider.isAvailable.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/health", () => {
  it("answers with only a coarse status and keeps the correlation header", async () => {
    const response = await GET(new Request(URL, { headers: { "X-Request-ID": "corr-123" } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    // Correlation stays in the header…
    expect(response.headers.get("X-Request-ID")).toBe("corr-123");
    // …while the body discloses nothing but the word.
    expect(body).toEqual({ status: "ok" });
    expect(Object.keys(body)).toEqual(["status"]);
    expect(JSON.stringify(body)).not.toContain("database");
    expect(JSON.stringify(body)).not.toContain("circuit");
  });

  it("returns 503 with { status: 'down' } without echoing database errors", async () => {
    // Both attempts fail: this is a real outage, not a cold connection.
    mocks.prisma.$queryRaw.mockRejectedValue(new Error("password=secret"));

    const response = await GET(new Request(URL));
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).not.toContain("password=secret");
    expect(JSON.parse(text)).toEqual({ status: "down" });
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("retries once and reports ok when the first probe times out", async () => {
    vi.useFakeTimers();
    mocks.prisma.$queryRaw
      // Never resolves: the 1,500ms window rejects the first race.
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(() => Promise.resolve([{ ok: 1 }]));

    const pending = GET(new Request(URL));
    await vi.advanceTimersByTimeAsync(1_500);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("reports down only when both probes time out", async () => {
    vi.useFakeTimers();
    mocks.prisma.$queryRaw.mockImplementation(() => new Promise(() => {}));

    const pending = GET(new Request(URL));
    await vi.advanceTimersByTimeAsync(1_500); // first window
    await vi.advanceTimersByTimeAsync(3_000); // retry window
    const response = await pending;

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "down" });
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("reports optional AI outage as degraded, not unhealthy", async () => {
    mocks.provider.isAvailable.mockReturnValue(false);

    const response = await GET(new Request(URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "degraded" });
    resetAiControlsForTests();
  });
});
