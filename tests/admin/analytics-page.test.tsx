import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The admin dashboard's KPI cards (buyer audit round 6).
 *
 * This page had no render test at all; the KPI fix is identical to the
 * store-report copy, so this suite pins the same contract on the admin side:
 * the label and the value are two plain paragraphs in that DOM order, and the
 * value no longer carries aria-label={label} (where honoured that announced the
 * label twice and never the number; where not, it was dead markup).
 */

const mocks = vi.hoisted(() => ({ stores: vi.fn(), dashboard: vi.fn() }));

vi.mock("@/lib/admin/server-access", () => ({ requireAdmin: vi.fn(async () => undefined) }));
vi.mock("@/lib/admin/repository", () => ({ getActiveStores: mocks.stores }));
vi.mock("@/components/admin/AnalyticsRangeNav", () => ({ default: () => null }));
vi.mock("@/components/admin/ReportLinkPanel", () => ({ default: () => null }));
vi.mock("@/lib/analytics/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics/service")>();
  return { ...actual, getAnalyticsDashboardData: mocks.dashboard };
});

import AdminAnalyticsPage from "@/app/admin/analytics/page";
import { formatPersianPercent, toPersianDigits } from "@/lib/persian";
import type { AnalyticsDashboardData } from "@/lib/analytics/service";

const DATA: AnalyticsDashboardData = {
  range: "7d",
  summary: {
    widgetViewed: 7,
    quizStarted: 12,
    quizCompleted: 8,
    resultViewed: 6,
    recommendationsShown: 5,
    perfumeClicked: 2,
  },
  topPerfumes: [],
  daily: [],
  // Batch 66: the page now renders this block (distinct sessions per stage,
  // not the event counts above), so the fixture is load-bearing.
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
  completionRate: 50,
  clickRate: 40,
  hasData: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stores.mockResolvedValue([
    { id: "store-1", name: "فروشگاه نمونه", websiteUrl: null },
  ]);
  mocks.dashboard.mockResolvedValue(DATA);
});

describe("admin analytics session funnel", () => {
  it("renders the funnel stages and their stage-to-stage rates", async () => {
    const html = renderToStaticMarkup(
      await AdminAnalyticsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("قیف تلاش‌ها");
    for (const stage of ["شروع آزمون", "تکمیل آزمون", "مشاهدهٔ نتیجه", "نمایش پیشنهادها", "کلیک روی عطر"]) {
      expect(html).toContain(stage);
    }

    // Distinct sessions, rendered as Persian digits: 9 / 7 / 6 / 6 / 3.
    for (const count of [9, 7, 6, 3]) {
      expect(html).toContain(toPersianDigits(count));
    }
    // Rate labels are the store report's, and the rates come from the fixture.
    expect(html).toContain("از شروع");
    expect(html).toContain("از تکمیل");
    expect(html).toContain("از مشاهده");
    expect(html).toContain(formatPersianPercent(50)); // clickRate
  });

  it("scales the bars by the widest stage, not the first one", async () => {
    const html = renderToStaticMarkup(
      await AdminAnalyticsPage({ searchParams: Promise.resolve({}) }),
    );

    // Funnel max is 9 (started), so started is full-width and completed is 7/9.
    expect(html).toContain("width:100%");
    expect(html).toContain("width:78%");
    expect(html).not.toMatch(/width:NaN|Infinity/);
  });

  it("carries the store report's disclosure about the session subset", async () => {
    const html = renderToStaticMarkup(
      await AdminAnalyticsPage({ searchParams: Promise.resolve({}) }),
    );

    // Byte-identical wording to app/store-report/[token]/page.tsx.
    expect(html.replace(/\s+/g, " ")).toContain(
      "بر اساس تلاش‌های دارای شناسهٔ نشست؛ رویدادهای بدون شناسه در این بخش شمرده نمی‌شوند و شمارش کلی رویدادها در بالا دست‌نخورده است.",
    );
  });

  it("draws empty bars and «—» on an all-zero funnel, never NaN", async () => {
    const zero = {
      ...DATA,
      sessionFunnel: {
        started: 0,
        completed: 0,
        resultViewed: 0,
        recommendationsShown: 0,
        perfumeClicked: 0,
        sessions: 0,
        completionRate: null,
        resultViewRate: null,
        clickRate: null,
      },
    };
    mocks.dashboard.mockResolvedValue(zero);

    const html = renderToStaticMarkup(
      await AdminAnalyticsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain("width:0%");
    expect(html).toContain("—");
  });
});

describe("admin analytics KPI accessibility", () => {
  it("reads label then value, with no aria-label on the number", async () => {
    const html = renderToStaticMarkup(
      await AdminAnalyticsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("بازدید ویجت");
    expect(html).not.toContain('aria-label="بازدید ویجت"');

    const label = html.indexOf("بازدید ویجت");
    const value = html.indexOf(toPersianDigits(DATA.summary.widgetViewed));

    expect(label).toBeGreaterThan(-1);
    expect(value).toBeGreaterThan(label);
  });
});
