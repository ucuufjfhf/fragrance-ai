import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DASHBOARD_CACHE_MAX_ENTRIES,
  DASHBOARD_CACHE_TTL_MS,
  analyticsDashboardCacheSizeForTests,
  getAnalyticsDashboardData,
  resetAnalyticsDashboardCacheForTests,
} from "@/lib/analytics/service";

/**
 * The dashboard cache (buyer audit round 7).
 *
 * A merchant refreshing `/store-report/[token]` repeats the same aggregation,
 * and that aggregation re-reads every event row in the range (the per-row JS
 * roll-ups in the repository). This suite pins the small in-process cache
 * around it, with the repository fully mocked so nothing touches a database:
 *
 * - the argument set decides a hit (two renders → one aggregation),
 * - a different argument set is a miss,
 * - the TTL is the freshness contract (past it, refetch),
 * - a rejection is never remembered (the retry runs again and can succeed),
 * - the map stays bounded and concurrent identical calls share one run.
 */

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  top: vi.fn(),
  daily: vi.fn(),
}));

vi.mock("@/lib/analytics/repository", () => ({
  createAnalyticsEvent: vi.fn(async () => true),
  getAnalyticsSummary: mocks.summary,
  getTopPerfumes: mocks.top,
  getDailyAnalytics: mocks.daily,
}));

const SUMMARY = {
  widgetViewed: 4,
  quizStarted: 3,
  quizCompleted: 2,
  resultViewed: 2,
  recommendationsShown: 1,
  perfumeClicked: 1,
};

/** One aggregation = one call to each of the three repository reads. */
function expectAggregations(count: number): void {
  expect(mocks.summary).toHaveBeenCalledTimes(count);
  expect(mocks.top).toHaveBeenCalledTimes(count);
  expect(mocks.daily).toHaveBeenCalledTimes(count);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAnalyticsDashboardCacheForTests();
  mocks.summary.mockResolvedValue(SUMMARY);
  mocks.top.mockResolvedValue([]);
  mocks.daily.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getAnalyticsDashboardData — 60s in-process cache", () => {
  it("serves two identical calls from a single aggregation", async () => {
    const first = await getAnalyticsDashboardData("store-1", "7d");
    const second = await getAnalyticsDashboardData("store-1", "7d");

    expect(second).toEqual(first);
    expectAggregations(1);
  });

  it("misses when any argument differs", async () => {
    await getAnalyticsDashboardData("store-1", "7d");
    await getAnalyticsDashboardData("store-1", "30d");
    await getAnalyticsDashboardData("store-2", "7d");

    expectAggregations(3);
  });

  it("refetches once the entry is older than the TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T10:00:00.000Z"));

    await getAnalyticsDashboardData("store-1", "7d");
    await getAnalyticsDashboardData("store-1", "7d");
    expectAggregations(1);

    // Still inside the window (one millisecond short): still a hit.
    vi.setSystemTime(new Date(Date.now() + DASHBOARD_CACHE_TTL_MS - 1));
    await getAnalyticsDashboardData("store-1", "7d");
    expectAggregations(1);

    // The TTL boundary itself is already stale.
    vi.setSystemTime(new Date(Date.now() + 1));
    await getAnalyticsDashboardData("store-1", "7d");
    expectAggregations(2);
  });

  it("never caches a failure — the retry runs and can succeed", async () => {
    mocks.summary.mockRejectedValueOnce(new Error("db down"));

    await expect(getAnalyticsDashboardData("store-1", "7d")).rejects.toThrow("db down");

    // No entry was left behind by the failed call.
    expect(analyticsDashboardCacheSizeForTests()).toBe(0);

    const data = await getAnalyticsDashboardData("store-1", "7d");

    expect(data.hasData).toBe(true);
    // The failed attempt stopped at its first read, so only that read ran twice.
    expect(mocks.summary).toHaveBeenCalledTimes(2);
    expect(mocks.top).toHaveBeenCalledTimes(1);
    expect(mocks.daily).toHaveBeenCalledTimes(1);
  });

  it("shares one aggregation between concurrent identical calls", async () => {
    let release: (value: typeof SUMMARY) => void = () => {};
    mocks.summary.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const first = getAnalyticsDashboardData("store-1", "7d");
    const second = getAnalyticsDashboardData("store-1", "7d");

    expect(mocks.summary).toHaveBeenCalledTimes(1);

    release(SUMMARY);

    const [a, b] = await Promise.all([first, second]);

    expect(b).toEqual(a);
    expectAggregations(1);
  });

  it("stays bounded at the configured capacity", async () => {
    for (let index = 0; index <= DASHBOARD_CACHE_MAX_ENTRIES; index += 1) {
      await getAnalyticsDashboardData(`store-${index}`, "7d");
    }

    expect(analyticsDashboardCacheSizeForTests()).toBe(DASHBOARD_CACHE_MAX_ENTRIES);

    // The first store was evicted, so asking for it aggregates again.
    mocks.summary.mockClear();
    await getAnalyticsDashboardData("store-0", "7d");
    expect(mocks.summary).toHaveBeenCalledTimes(1);
  });
});
