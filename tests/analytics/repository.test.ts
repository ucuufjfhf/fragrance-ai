import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAnalyticsEvent,
  getAnalyticsSummary,
  getTopPerfumes,
  getDailyAnalytics,
} from "@/lib/analytics/repository";

/**
 * Phase 7 repository tests (spec §26, aggregation) with a mocked Prisma.
 * Verifies the counting/aggregation logic against canned query results —
 * no live database.
 */

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  perfumeFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    analyticsEvent: { groupBy: mocks.groupBy, findMany: mocks.findMany, create: mocks.create },
    perfume: { findMany: mocks.perfumeFindMany },
  }),
}));

const RANGE = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-08T00:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAnalyticsSummary — grouped counting (§20)", () => {
  it("maps the groupBy rows onto the typed summary", async () => {
    mocks.groupBy.mockResolvedValue([
      { eventType: "QUIZ_STARTED", _count: { _all: 12 } },
      { eventType: "QUIZ_COMPLETED", _count: { _all: 8 } },
      { eventType: "RESULT_VIEWED", _count: { _all: 6 } },
      { eventType: "RECOMMENDATIONS_SHOWN", _count: { _all: 6 } },
      { eventType: "PERFUME_CLICKED", _count: { _all: 3 } },
    ]);

    const summary = await getAnalyticsSummary("store-1", RANGE);

    expect(summary).toEqual({
      quizStarted: 12,
      quizCompleted: 8,
      resultViewed: 6,
      recommendationsShown: 6,
      perfumeClicked: 3,
    });

    // Every dashboard query must be store + time scoped (§13/§15).
    const where = mocks.groupBy.mock.calls[0][0].where;

    expect(where.storeId).toBe("store-1");
    expect(where.createdAt).toEqual({ gte: RANGE.from, lt: RANGE.to });
  });

  it("returns zeros for event types with no rows", async () => {
    mocks.groupBy.mockResolvedValue([{ eventType: "QUIZ_STARTED", _count: { _all: 4 } }]);

    const summary = await getAnalyticsSummary("store-1", RANGE);

    expect(summary.quizCompleted).toBe(0);
    expect(summary.perfumeClicked).toBe(0);
  });
});

describe("getTopPerfumes — aggregation and store-scoped join (§17/§18)", () => {
  it("sums metadata.count per perfume and joins names from this store only", async () => {
    // Call 1: click + shown event rows. Call 2: shown rows with metadata.
    mocks.findMany
      .mockResolvedValueOnce([
        { perfumeId: "p1", eventType: "PERFUME_CLICKED" },
        { perfumeId: "p1", eventType: "PERFUME_CLICKED" },
        { perfumeId: "p2", eventType: "PERFUME_CLICKED" },
      ])
      .mockResolvedValueOnce([
        { perfumeId: "p1", metadata: { count: 3 } },
        { perfumeId: "p1", metadata: { count: 2 } },
        { perfumeId: "p2", metadata: { count: 4 } },
      ]);

    mocks.perfumeFindMany.mockResolvedValue([
      { id: "p1", name: "عطر آلفا", brand: "Brand A" },
      { id: "p2", name: "عطر بتا", brand: "Brand B" },
    ]);

    const rows = await getTopPerfumes("store-1", RANGE);

    expect(rows).toEqual([
      { perfumeId: "p1", name: "عطر آلفا", brand: "Brand A", recommendationCount: 5, clickCount: 2 },
      { perfumeId: "p2", name: "عطر بتا", brand: "Brand B", recommendationCount: 4, clickCount: 1 },
    ]);

    // The catalog join is store-scoped — a foreign perfume can never appear.
    expect(mocks.perfumeFindMany).toHaveBeenCalledWith({
      where: { storeId: "store-1", id: { in: ["p1", "p2"] } },
      select: { id: true, name: true, brand: true },
    });
  });

  it("treats malformed/absent metadata counts as 0, never NaN", async () => {
    mocks.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { perfumeId: "p1", metadata: { count: "many" } },
        { perfumeId: "p1", metadata: null },
        { perfumeId: "p1", metadata: { count: -3 } },
      ]);

    mocks.perfumeFindMany.mockResolvedValue([{ id: "p1", name: "x", brand: "y" }]);

    const rows = await getTopPerfumes("store-1", RANGE);

    expect(rows[0].recommendationCount).toBe(0);
  });

  it("keeps events for perfumes no longer in the catalog (placeholder name)", async () => {
    mocks.findMany
      .mockResolvedValueOnce([{ perfumeId: "p-gone", eventType: "PERFUME_CLICKED" }])
      .mockResolvedValueOnce([{ perfumeId: "p-gone", metadata: { count: 1 } }]);

    mocks.perfumeFindMany.mockResolvedValue([]);

    const rows = await getTopPerfumes("store-1", RANGE);

    expect(rows).toEqual([
      { perfumeId: "p-gone", name: "عطر حذف‌شده", brand: "—", recommendationCount: 1, clickCount: 1 },
    ]);
  });

  it("returns an empty list when no perfume-scoped events exist", async () => {
    mocks.findMany.mockResolvedValue([]).mockResolvedValueOnce([]);

    const rows = await getTopPerfumes("store-1", RANGE);

    expect(rows).toEqual([]);
    expect(mocks.perfumeFindMany).not.toHaveBeenCalled();
  });
});

describe("getDailyAnalytics — daily roll-up (§19)", () => {
  it("buckets events by UTC day and sums per type", async () => {
    mocks.findMany.mockResolvedValue([
      { eventType: "QUIZ_STARTED", createdAt: new Date("2026-09-02T08:00:00Z") },
      { eventType: "QUIZ_STARTED", createdAt: new Date("2026-09-02T21:00:00Z") },
      { eventType: "QUIZ_COMPLETED", createdAt: new Date("2026-09-02T22:00:00Z") },
      { eventType: "RESULT_VIEWED", createdAt: new Date("2026-09-03T10:00:00Z") },
      { eventType: "PERFUME_CLICKED", createdAt: new Date("2026-09-03T11:00:00Z") },
      { eventType: "RECOMMENDATIONS_SHOWN", createdAt: new Date("2026-09-03T11:05:00Z") },
    ]);

    const rows = await getDailyAnalytics("store-1", RANGE);

    expect(rows).toEqual([
      { date: "2026-09-02", quizStarted: 2, quizCompleted: 1, resultViewed: 0, perfumeClicked: 0 },
      { date: "2026-09-03", quizStarted: 0, quizCompleted: 0, resultViewed: 1, perfumeClicked: 1 },
    ]);
  });

  it("returns an empty list for an eventless range", async () => {
    mocks.findMany.mockResolvedValue([]);

    const rows = await getDailyAnalytics("store-1", RANGE);

    expect(rows).toEqual([]);
  });
});

describe("createAnalyticsEvent — append-only write (§4)", () => {
  it("creates the event and returns true", async () => {
    mocks.create.mockResolvedValue({ id: "evt-1" });

    const ok = await createAnalyticsEvent({
      eventType: "QUIZ_STARTED",
      storeId: "store-1",
      sessionId: "s-1",
    });

    expect(ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);

    const call = mocks.create.mock.calls[0][0];

    expect(call.data.eventType).toBe("QUIZ_STARTED");
    expect(call.data.storeId).toBe("store-1");
  });

  it("returns false instead of throwing on a DB failure", async () => {
    mocks.create.mockRejectedValue(new Error("connection refused"));

    const ok = await createAnalyticsEvent({ eventType: "QUIZ_STARTED" });

    expect(ok).toBe(false);
  });
});
