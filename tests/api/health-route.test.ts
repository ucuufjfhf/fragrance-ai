import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() }, provider: { isAvailable: vi.fn() } }));
vi.mock("@/lib/db", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("@/lib/ai/provider", () => ({ createAIProvider: () => mocks.provider }));
vi.mock("@/lib/ai/cost-controls", () => ({ getAiControlState: () => ({ circuitState: "CLOSED" }), resetAiControlsForTests: vi.fn() }));

import { GET } from "@/app/api/health/route";
import { resetAiControlsForTests } from "@/lib/ai/cost-controls";

beforeEach(() => { vi.clearAllMocks(); mocks.prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]); mocks.provider.isAvailable.mockReturnValue(true); });

describe("GET /api/health", () => {
  it("returns safe healthy status and request id", async () => {
    const response = await GET(new Request("https://app.test/api/health", { headers: { "X-Request-ID": "corr-123" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-ID")).toBe("corr-123");
    expect(body).toMatchObject({ status: "ok", database: "ok", ai: { status: "available", circuit: "CLOSED" }, requestId: "corr-123" });
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL");
  });

  it("returns 503 without exposing database errors", async () => {
    mocks.prisma.$queryRaw.mockRejectedValue(new Error("password=secret"));
    const response = await GET(new Request("https://app.test/api/health"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("password=secret");
  });

  it("reports optional AI outage as degraded, not unhealthy", async () => {
    mocks.provider.isAvailable.mockReturnValue(false);
    const response = await GET(new Request("https://app.test/api/health"));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("degraded");
    resetAiControlsForTests();
  });
});
