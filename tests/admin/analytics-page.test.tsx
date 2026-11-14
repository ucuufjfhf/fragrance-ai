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
import { toPersianDigits } from "@/lib/persian";
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
  // Present on the shared object (both consumers receive it); this page's
  // explicit markup does not render the funnel block yet.
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
