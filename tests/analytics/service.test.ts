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
  perfumeFindMany: vi.fn(),
  eventCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    store: { findFirst: mocks.storeFindFirst },
    perfume: { findFirst: mocks.perfumeFindFirst, findMany: mocks.perfumeFindMany },
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
  getSessionFunnel: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storeFindFirst.mockResolvedValue({ id: "store-1" });
  mocks.perfumeFindFirst.mockResolvedValue({ id: "perfume-1" });
  mocks.perfumeFindMany.mockResolvedValue([]);
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

  it("keeps metadata.perfumeIds when every id belongs to the event's store", async () => {
    mocks.perfumeFindMany.mockResolvedValue([{ id: "perfume-1" }, { id: "perfume-2" }]);

    const result = await recordAnalyticsEvent({
      eventType: "RECOMMENDATIONS_SHOWN",
      storeId: "store-1",
      metadata: { count: 2, perfumeIds: ["perfume-1", "perfume-2"] },
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.perfumeFindMany).toHaveBeenCalledWith({
      where: { storeId: "store-1", id: { in: ["perfume-1", "perfume-2"] } },
      select: { id: true },
    });

    const written = mocks.eventCreate.mock.calls[0][0];

    expect(written.metadata).toEqual({ count: 2, perfumeIds: ["perfume-1", "perfume-2"] });
  });

  it("drops perfumeIds when any id is foreign — and still records the count", async () => {
    // Only one of the two ids exists in this store: the list is enrichment, so
    // the whole list goes and the impression count survives.
    mocks.perfumeFindMany.mockResolvedValue([{ id: "perfume-1" }]);

    const result = await recordAnalyticsEvent({
      eventType: "RECOMMENDATIONS_SHOWN",
      storeId: "store-1",
      metadata: { count: 2, perfumeIds: ["perfume-1", "perfume-from-store-2"] },
    });

    expect(result).toEqual({ ok: true });

    const written = mocks.eventCreate.mock.calls[0][0];

    expect(written.metadata).toEqual({ count: 2 });
  });

  it("drops perfumeIds when the membership query fails (never loses the count)", async () => {
    mocks.perfumeFindMany.mockRejectedValue(new Error("connection refused"));

    const result = await recordAnalyticsEvent({
      eventType: "RECOMMENDATIONS_SHOWN",
      storeId: "store-1",
      metadata: { count: 1, perfumeIds: ["perfume-1"] },
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.eventCreate.mock.calls[0][0].metadata).toEqual({ count: 1 });
  });

  it("drops perfumeIds when the event carries no store to verify against", async () => {
    const result = await recordAnalyticsEvent({
      eventType: "RECOMMENDATIONS_SHOWN",
      metadata: { count: 2, perfumeIds: ["perfume-1"] },
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.perfumeFindMany).not.toHaveBeenCalled();
    expect(mocks.eventCreate.mock.calls[0][0].metadata).toEqual({ count: 2 });
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
      widgetViewed: 30,
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
      widgetViewed: 0,
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

  it("carries the session-joined funnel beside the untouched event counts", async () => {
    vi.resetModules();

    const repositoryMock = vi.mocked(await import("@/lib/analytics/repository"));

    vi.mocked(repositoryMock.getAnalyticsSummary).mockResolvedValue({
      widgetViewed: 30,
      quizStarted: 10,
      quizCompleted: 7,
      resultViewed: 6,
      recommendationsShown: 20,
      perfumeClicked: 5,
    });
    vi.mocked(repositoryMock.getTopPerfumes).mockResolvedValue([]);
    vi.mocked(repositoryMock.getDailyAnalytics).mockResolvedValue([]);
    vi.mocked(repositoryMock.getSessionFunnel).mockResolvedValue({
      started: 9,
      completed: 7,
      resultViewed: 6,
      recommendationsShown: 6,
      perfumeClicked: 3,
      sessions: 9,
      completionRate: (7 / 9) * 100,
      resultViewRate: (6 / 7) * 100,
      clickRate: 50,
    });

    const { getAnalyticsDashboardData } = await import("@/lib/analytics/service");
    const data = await getAnalyticsDashboardData("store-1", "7d");

    // The joined funnel rides the same cached aggregation, additively.
    expect(data.sessionFunnel.started).toBe(9);
    expect(data.sessionFunnel.clickRate).toBe(50);
    // Event counts are a different population and stay exactly as they were.
    expect(data.summary.quizStarted).toBe(10);
    expect(data.completionRate).toBeCloseTo(70);
  });
});
