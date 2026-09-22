import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordAnalyticsEvent } from "@/lib/analytics/service";

/**
 * Phase 7 service tests (spec §26, store isolation + no-fake-data) with a
 * fully mocked Prisma — no live DB. Focus: relationship validation on the
 * write path (the browser is never trusted) and the never-throw guarantee.
 */

const mocks = vi.hoisted(() => ({
  storeFindFirst: vi.fn(),
  perfumeFindFirst: vi.fn(),
  eventCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    store: { findFirst: mocks.storeFindFirst },
    perfume: { findFirst: mocks.perfumeFindFirst },
    analyticsEvent: { create: mocks.eventCreate },
  }),
}));

vi.mock("@/lib/analytics/repository", () => ({
  createAnalyticsEvent: async (input: unknown) => {
    mocks.eventCreate(input);

    return true;
  },
  getAnalyticsSummary: vi.fn(),
  getTopPerfumes: vi.fn(),
  getDailyAnalytics: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storeFindFirst.mockResolvedValue({ id: "store-1" });
  mocks.perfumeFindFirst.mockResolvedValue({ id: "perfume-1" });
});

describe("recordAnalyticsEvent — relationship validation (§10/§13)", () => {
  it("accepts a well-formed event for an active store", async () => {
    const result = await recordAnalyticsEvent({ eventType: "QUIZ_STARTED", storeId: "store-1" });

    expect(result).toEqual({ ok: true });
    expect(mocks.storeFindFirst).toHaveBeenCalledWith({
      where: { id: "store-1", active: true },
      select: { id: true },
    });
  });

  it("rejects an event for an unknown or inactive store", async () => {
    mocks.storeFindFirst.mockResolvedValue(null);
    const result = await recordAnalyticsEvent({ eventType: "QUIZ_STARTED", storeId: "store-x" });

    expect(result).toEqual({ ok: false, reason: "STORE_NOT_FOUND" });
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("accepts a perfume that belongs to the event's store", async () => {
    const result = await recordAnalyticsEvent({
      eventType: "PERFUME_CLICKED",
      storeId: "store-1",
      perfumeId: "perfume-1",
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.perfumeFindFirst).toHaveBeenCalledWith({
      where: { id: "perfume-1", storeId: "store-1" },
      select: { id: true },
    });
  });

  it("rejects a foreign-store perfume id (store isolation on writes)", async () => {
    mocks.perfumeFindFirst.mockResolvedValue(null);
    const result = await recordAnalyticsEvent({
      eventType: "PERFUME_CLICKED",
      storeId: "store-1",
      perfumeId: "perfume-from-store-2",
    });

    expect(result).toEqual({ ok: false, reason: "PERFUME_NOT_IN_STORE" });
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("scopes the perfume check to the event's store, not the whole catalog", async () => {
    await recordAnalyticsEvent({
      eventType: "PERFUME_CLICKED",
      storeId: "store-1",
      perfumeId: "perfume-1",
    });

    const where = mocks.perfumeFindFirst.mock.calls[0][0].where;

    expect(where.storeId).toBe("store-1");
  });

  it("rejects an invalid payload before any DB access", async () => {
    const result = await recordAnalyticsEvent({ eventType: "NOT_A_TYPE" });

    expect(result.ok).toBe(false);
    expect(mocks.storeFindFirst).not.toHaveBeenCalled();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("does not throw when persistence fails — analytics never breaks the flow", async () => {
    const repository = await import("@/lib/analytics/repository");

    const spy = vi.spyOn(repository, "createAnalyticsEvent").mockResolvedValue(false);

    const result = await recordAnalyticsEvent({ eventType: "QUIZ_STARTED", storeId: "store-1" });

    expect(result).toEqual({ ok: false, reason: "INVALID_EVENT", detail: "persistence failed." });

    spy.mockRestore();
  });
});

describe("parseAnalyticsRange — defensive param handling (§15)", () => {
  it("accepts the three canonical presets", async () => {
    const { parseAnalyticsRange } = await import("@/lib/analytics/service");

    expect(parseAnalyticsRange("today")).toBe("today");
    expect(parseAnalyticsRange("7d")).toBe("7d");
    expect(parseAnalyticsRange("30d")).toBe("30d");
  });

  it("falls back to the 7d default for unknown values", async () => {
    const { parseAnalyticsRange } = await import("@/lib/analytics/service");

    expect(parseAnalyticsRange(undefined)).toBe("7d");
    expect(parseAnalyticsRange("forever")).toBe("7d");
    expect(parseAnalyticsRange(["7d"])).toBe("7d");
  });
});

describe("buildAnalyticsRange — UTC boundary convention (§15/§29)", () => {
  it("returns UTC day boundaries; today = one day, 7d = seven days", async () => {
    const { buildAnalyticsRange } = await import("@/lib/analytics/service");

    const now = new Date("2026-09-22T14:30:00Z");

    const today = buildAnalyticsRange("today", now);
    const sevenDays = buildAnalyticsRange("7d", now);
    const thirtyDays = buildAnalyticsRange("30d", now);

    // `to` is exclusive midnight after the current UTC day.
    expect(today.to.toISOString()).toBe("2026-09-23T00:00:00.000Z");
    expect(today.from.toISOString()).toBe("2026-09-22T00:00:00.000Z");

    // 7 days including today, exclusive end.
    expect(sevenDays.from.toISOString()).toBe("2026-09-16T00:00:00.000Z");
    expect(sevenDays.to.toISOString()).toBe("2026-09-23T00:00:00.000Z");

    expect(thirtyDays.from.toISOString()).toBe("2026-08-24T00:00:00.000Z");

    const spanMs = sevenDays.to.getTime() - sevenDays.from.getTime();

    expect(spanMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("getAnalyticsDashboardData — KPI math (§16/§18)", () => {
  it("computes completion and click rates and derives null for zero denominators", async () => {
    vi.resetModules();

    // Two summary scenarios through the mocked repository.
    const repositoryMock = vi.mocked(await import("@/lib/analytics/repository"));

    vi.mocked(repositoryMock.getAnalyticsSummary).mockResolvedValue({
      quizStarted: 10,
      quizCompleted: 7,
      resultViewed: 6,
      recommendationsShown: 20,
      perfumeClicked: 5,
    });
    vi.mocked(repositoryMock.getTopPerfumes).mockResolvedValue([]);
    vi.mocked(repositoryMock.getDailyAnalytics).mockResolvedValue([]);

    const { getAnalyticsDashboardData } = await import("@/lib/analytics/service");
    const data = await getAnalyticsDashboardData("store-1", "7d");

    expect(data.completionRate).toBeCloseTo(70);
    expect(data.clickRate).toBeCloseTo(25);
    expect(data.hasData).toBe(true);
  });

  it("returns null rates (rendered as —) when denominators are zero", async () => {
    vi.resetModules();

    const repositoryMock = vi.mocked(await import("@/lib/analytics/repository"));

    vi.mocked(repositoryMock.getAnalyticsSummary).mockResolvedValue({
      quizStarted: 0,
      quizCompleted: 0,
      resultViewed: 0,
      recommendationsShown: 0,
      perfumeClicked: 0,
    });
    vi.mocked(repositoryMock.getTopPerfumes).mockResolvedValue([]);
    vi.mocked(repositoryMock.getDailyAnalytics).mockResolvedValue([]);

    const { getAnalyticsDashboardData } = await import("@/lib/analytics/service");
    const data = await getAnalyticsDashboardData("store-1", "today");

    // Never NaN or Infinity (§16) — null means the UI renders «—».
    expect(data.completionRate).toBeNull();
    expect(data.clickRate).toBeNull();
    expect(Number.isNaN(data.completionRate ?? 0)).toBe(false);
    expect(data.hasData).toBe(false);
  });
});
