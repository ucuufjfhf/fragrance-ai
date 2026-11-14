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
    widgetViewed: 40,
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
  sessionFunnel: {
    started: 9,
    completed: 7,
    resultViewed: 6,
    recommendationsShown: 6,
    perfumeClicked: 3,
    sessions: 9,
    completionRate: (7 / 9) * 100,
    resultViewRate: (6 / 7) * 100,
    clickRate: 50,
  },
  completionRate: 66.666,
  clickRate: 40,
  hasData: true,
};

async function renderReport(data: AnalyticsDashboardData = DATA) {
  mocks.storeByToken.mockResolvedValue({ id: "store-1", name: "فروشگاه نمونه", logoUrl: null });
  mocks.dashboardData.mockResolvedValue(data);

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

  it("shows the widget-impression KPI as the funnel's first step", async () => {
    const html = await renderReport();

    expect(html).toContain("بازدید ویجت");
    expect(html).toContain(toPersianDigits(40));
    // Before «شروع آزمون», because a widget view happens before a quiz start.
    expect(html.indexOf("بازدید ویجت")).toBeLessThan(html.indexOf("شروع آزمون"));
  });

  it("reads each KPI as label then value, with no aria-label on the number", async () => {
    const html = await renderReport();

    // aria-label on the value element replaced the number with the label again.
    expect(html).not.toContain('aria-label="بازدید ویجت"');
    const label = html.indexOf("بازدید ویجت");
    const value = html.indexOf(toPersianDigits(DATA.summary.widgetViewed));

    expect(label).toBeGreaterThan(-1);
    expect(value).toBeGreaterThan(label);
  });

  it("renders the session-joined funnel with its own population note", async () => {
    const html = await renderReport();

    expect(html).toContain("قیف تلاش‌ها");
    expect(html).toContain("بر اساس تلاش‌های دارای شناسهٔ نشست");
    expect(html).toContain(toPersianDigits(DATA.sessionFunnel.started));
    expect(html).toContain(toPersianDigits(DATA.sessionFunnel.perfumeClicked));
    // 3 clicks / 6 result views — the joined rate, never the event-count rate.
    expect(html).toContain(formatPersianPercent(50));
    // The event-count KPIs stay beside it, unmerged.
    expect(html).toContain("بازدید ویجت");
  });

  it("renders «—» for null joined rates and no session identifier anywhere", async () => {
    const html = await renderReport({
      ...DATA,
      sessionFunnel: {
        ...DATA.sessionFunnel,
        completionRate: null,
        resultViewRate: null,
        clickRate: null,
      },
    });

    expect(html).toContain("—");
    expect(html).not.toContain("NaN");
    // Aggregate-only contract: not a single attempt id reaches the markup.
    expect(html.toLowerCase()).not.toContain("session");
  });

  it("renders a dash for a perfume that was only ever clicked", async () => {
    const html = await renderReport();

    expect(html).toContain("عطر بتا");
    // shown = 0 → the rate is «—» rather than a division by zero.
    expect(html).toContain("—");
    expect(html).not.toContain("NaN");
  });
});

describe("store report page — daily bar chart above the table", () => {
  // 2026-09-19 is a Saturday, 09-20 a Sunday, 09-21 Monday, 09-22 Tuesday.
  const DAILY: AnalyticsDashboardData["daily"] = [
    { date: "2026-09-19", quizStarted: 5, quizCompleted: 4, resultViewed: 3, perfumeClicked: 1 },
    { date: "2026-09-20", quizStarted: 10, quizCompleted: 8, resultViewed: 6, perfumeClicked: 2 },
    { date: "2026-09-21", quizStarted: 0, quizCompleted: 0, resultViewed: 0, perfumeClicked: 0 },
    { date: "2026-09-22", quizStarted: 1, quizCompleted: 1, resultViewed: 1, perfumeClicked: 0 },
  ];

  it("renders one column per row, in the table's order, with UTC weekday labels", async () => {
    const html = await renderReport({ ...DATA, daily: DAILY });

    expect((html.match(/rounded-t-md/g) ?? []).length).toBe(DAILY.length);

    const order = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه"].map((day) => html.indexOf(day));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("scales bar heights to the busiest day and shows zero as ۰", async () => {
    const html = await renderReport({ ...DATA, daily: DAILY });
    const heights = [...html.matchAll(/height:(\d+)%/g)].map((match) => Number(match[1]));

    // max(quizStarted) = 10 on 2026-09-20 → 5/10=50, 10/10=100, 0, 1/10=10.
    expect(heights).toEqual([50, 100, 0, 10]);
    expect(html).toContain(toPersianDigits(0));
  });

  it("prints each day's starts in Persian digits under the sub-label", async () => {
    const html = await renderReport({ ...DATA, daily: DAILY });

    expect(html).toContain("شروع آزمون در هر روز");
    for (const count of [5, 10, 0, 1]) {
      expect(html).toContain(toPersianDigits(count));
    }
  });

  it("keeps the daily table with all four metrics and the same rows", async () => {
    const html = await renderReport({ ...DATA, daily: DAILY });

    expect((html.match(/<table/g) ?? []).length).toBe(2);
    expect(html).toContain("روند روزانه");
    for (const heading of ["تاریخ", "شروع آزمون", "تکمیل آزمون", "مشاهده نتایج", "کلیک"]) {
      expect(html).toContain(heading);
    }
    // Every row's date and its four metrics are still printed.
    for (const row of DAILY) {
      expect(html).toContain(toPersianDigits(row.date));
      for (const value of [row.quizStarted, row.quizCompleted, row.resultViewed, row.perfumeClicked]) {
        expect(html).toContain(toPersianDigits(value));
      }
    }
    // The other sections were not restructured by the chart.
    expect(html).toContain("قیف تلاش‌ها");
    expect(html).toContain("بازدید ویجت");
    expect(html).toContain("عطرهای پرتکرار در پیشنهادها");
  });

  it("renders no chart (and no sub-label) when the range has no rows", async () => {
    const html = await renderReport({ ...DATA, daily: [] });

    expect(html).not.toContain("rounded-t-md");
    expect(html).not.toContain("شروع آزمون در هر روز");
    expect(html).toContain("روند روزانه");
    expect((html.match(/<table/g) ?? []).length).toBe(2);
  });
});

describe("store report page — branded header and proportional funnel bars", () => {
  it("shows the FIAGE mark beside the unchanged merchant header", async () => {
    const html = await renderReport();

    expect(html).toContain('src="/brand/fiage-mark.png"');
    expect(html).toContain('width="560"');
    expect(html).toContain('height="560"');
    expect(html).toContain("h-12 w-12");
    expect(html).toContain("گزارش عملکرد فروشگاه شما");
    expect(html).toContain("فروشگاه:");
    expect(html).toContain("فروشگاه نمونه");
  });

  it("uses the editorial heading face for all three sections", async () => {
    const html = await renderReport();

    expect((html.match(/font-heading/g) ?? []).length).toBe(3);
    expect(html).toContain('class="font-heading text-lg font-bold"');
  });

  it("renders five bars proportional to the largest stage", async () => {
    const html = await renderReport();

    // Fixture: 9 started (the max), 7 completed, 6 result views, 6 shown, 3 clicks.
    const widths = [...html.matchAll(/width:(\d+)%/g)].map((match) => Number(match[1]));

    expect(widths).toEqual([100, 78, 67, 67, 33]);
    expect((html.match(/h-\[22px\]/g) ?? []).length).toBe(5);
    // Counts stay real text, in Persian digits.
    for (const count of [9, 7, 6, 3]) {
      expect(html).toContain(toPersianDigits(count));
    }
  });

  it("renders the four stage-to-stage rates under their labels", async () => {
    const html = await renderReport();

    expect(html).toContain(`${formatPersianPercent((7 / 9) * 100)} از شروع`);
    expect(html).toContain(`${formatPersianPercent((6 / 7) * 100)} از تکمیل`);
    expect(html).toContain(`${formatPersianPercent(100)} از مشاهده`);
    expect(html).toContain(`${formatPersianPercent(50)} از مشاهده`);
  });

  it("renders «—» for a stage rate whose denominator is zero", async () => {
    const html = await renderReport({
      ...DATA,
      sessionFunnel: {
        ...DATA.sessionFunnel,
        resultViewed: 0,
        recommendationsShown: 0,
        resultViewRate: null,
        clickRate: null,
      },
    });

    expect(html).toContain("—");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });

  it("keeps the funnel table-free and the two data tables untouched", async () => {
    const html = await renderReport();
    const funnelSection = html.slice(
      html.indexOf("قیف تلاش‌ها"),
      html.indexOf("عطرهای پرتکرار در پیشنهادها"),
    );

    expect(funnelSection).not.toContain("<table");
    // Top perfumes + daily roll-up (batch 54 owns the chart).
    expect((html.match(/<table/g) ?? []).length).toBe(2);
    expect(html).toContain("روند روزانه");
  });

  it("keeps the disclosure note byte-identical", async () => {
    const html = await renderReport();
    const text = html.replace(/\s+/g, " ");

    expect(text).toContain(
      "بر اساس تلاش‌های دارای شناسهٔ نشست؛ رویدادهای بدون شناسه در این بخش شمرده نمی‌شوند و شمارش کلی رویدادها در بالا دست‌نخورده است.",
    );
  });
});
