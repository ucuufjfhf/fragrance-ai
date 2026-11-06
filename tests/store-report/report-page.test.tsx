import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import StoreReportPage from "@/app/store-report/[token]/page";
import type { AnalyticsDashboardData } from "@/lib/analytics/service";
import { formatPersianPercent, toPersianDigits } from "@/lib/persian";

/**
 * The merchant report page, rendered statically with mocked data.
 *
 * What this pins is the buyer-facing promise of the analytics change: the
 * «most recommended» table is built from IMPRESSIONS, so it fills up for a
 * catalog whose perfumes have no product URL and whose shoppers never clicked
 * anything. The fixture deliberately has no click on the top row and no
 * productUrl field anywhere (the roll-up never selects one).
 */

const mocks = vi.hoisted(() => ({
  dashboardData: vi.fn(),
  storeByToken: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound()");
  },
}));

vi.mock("@/components/admin/AnalyticsRangeNav", () => ({ default: () => null }));

vi.mock("@/lib/store-report/report", () => ({
  getStoreByReportToken: mocks.storeByToken,
}));

vi.mock("@/lib/analytics/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics/service")>();

  return { ...actual, getAnalyticsDashboardData: mocks.dashboardData };
});

const DATA: AnalyticsDashboardData = {
  range: "7d",
  summary: {
    quizStarted: 12,
    quizCompleted: 8,
    resultViewed: 6,
    recommendationsShown: 5,
    perfumeClicked: 2,
  },
  topPerfumes: [
    {
      perfumeId: "p-alpha",
      name: "عطر آلفا",
      brand: "برند الف",
      shownCount: 37,
      recommendationCount: 0,
      clickCount: 13,
    },
    {
      perfumeId: "p-beta",
      name: "عطر بتا",
      brand: "برند ب",
      shownCount: 0,
      recommendationCount: 0,
      clickCount: 3,
    },
  ],
  daily: [],
  completionRate: 66.666,
  clickRate: 40,
  hasData: true,
};

async function renderReport() {
  mocks.storeByToken.mockResolvedValue({ id: "store-1", name: "فروشگاه نمونه", logoUrl: null });
  mocks.dashboardData.mockResolvedValue(DATA);

  return renderToStaticMarkup(
    await StoreReportPage({
      params: Promise.resolve({ token: "report-token" }),
      searchParams: Promise.resolve({}),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("store report page — «most recommended» from impressions", () => {
  it("renders the section for a catalog with no clicks and no product URLs", async () => {
    const html = await renderReport();

    expect(html).toContain("عطرهای پرتکرار در پیشنهادها");
    // The top row exists purely because it was SHOWN, never clicked.
    expect(html).toContain("عطر آلفا");
    expect(html).toContain(toPersianDigits(37));
  });

  it("shows the shown count, the click count and the click rate per row", async () => {
    const html = await renderReport();

    expect(html).toContain(toPersianDigits(37)); // shown
    expect(html).toContain(toPersianDigits(13)); // clicks
    // 13 / 37 ≈ 35% — the rate divides by the shown count, not the list count.
    expect(html).toContain(formatPersianPercent(35));
  });

  it("renders a dash for a perfume that was only ever clicked", async () => {
    const html = await renderReport();

    expect(html).toContain("عطر بتا");
    // shown = 0 → the rate is «—» rather than a division by zero.
    expect(html).toContain("—");
    expect(html).not.toContain("NaN");
  });
});
