import { notFound } from "next/navigation";

import type { Metadata } from "next";

import AnalyticsRangeNav from "@/components/admin/AnalyticsRangeNav";
import {
  getAnalyticsDashboardData,
  parseAnalyticsRange,
  type AnalyticsDashboardData,
  type AnalyticsRangePreset,
} from "@/lib/analytics/service";
import { getStoreByReportToken } from "@/lib/store-report/report";
import { formatPersianPercent, toPersianDigits } from "@/lib/persian";

/**
 * GET /store-report/[token] — read-only per-store report for merchants.
 *
 * No admin gate: the token IS the capability. An unknown or inactive token
 * renders the route not-found page (no data, no store enumeration). All
 * numbers come from the same `getAnalyticsDashboardData` aggregation the
 * admin dashboard uses — aggregates only, never session rows or PII.
 * `robots` noindex/nofollow keeps report links out of search engines.
 */

export const metadata: Metadata = {
  title: "گزارش عملکرد فروشگاه",
  robots: { index: false, follow: false },
};

interface StoreReportPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Reads the range param defensively; unknown values fall back to 7d. */
function readRange(params: Record<string, string | string[] | undefined>): AnalyticsRangePreset {
  const raw = params.range;

  return parseAnalyticsRange(Array.isArray(raw) ? raw[0] : raw);
}

export default async function StoreReportPage({ params, searchParams }: StoreReportPageProps) {
  const { token } = await params;
  const range = readRange(await searchParams);

  const store = await getStoreByReportToken(token);

  if (!store) {
    notFound();
  }

  const data = await getAnalyticsDashboardData(store.id, range);

  // Funnel bars are proportional to the LARGEST stage, not to "started": a
  // shared result link can produce RESULT_VIEWED without a QUIZ_STARTED, so
  // assuming step 1 is the maximum would push a bar past 100%.
  const funnel = data.sessionFunnel;
  const funnelMax = Math.max(
    funnel.started,
    funnel.completed,
    funnel.resultViewed,
    funnel.recommendationsShown,
    funnel.perfumeClicked,
  );
  // Impressions per result view — the same null-on-zero-denominator rule as
  // the other joined rates.
  const recommendationsRate =
    funnel.resultViewed === 0 ? null : (funnel.recommendationsShown / funnel.resultViewed) * 100;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-6 flex items-center gap-4">
        {/* Bundled public/ asset, not merchant data: a plain <img> keeps the
            exact file, with no loader in between. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/fiage-mark.png"
          alt="FIAGE"
          width={560}
          height={560}
          className="h-12 w-12 shrink-0 object-contain"
        />
        {store.logoUrl ? (
          // Plain img: merchant logos are external URLs outside the
          // next/image remote allowlist, and this page ships no client JS.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={store.logoUrl}
            alt={`لوگوی ${store.name}`}
            className="h-12 w-12 rounded-xl border border-border-soft object-contain"
          />
        ) : null}
        <div>
          <h1 className="text-2xl font-bold">گزارش عملکرد فروشگاه شما</h1>
          <p className="mt-1 text-sm text-muted">
            فروشگاه: <strong>{store.name}</strong>
          </p>
        </div>
      </header>

      <AnalyticsRangeNav
        current={data.range}
        hrefFor={(preset) => `/store-report/${encodeURIComponent(token)}?range=${preset}`}
      />

      {!data.hasData ? (
        <div
          role="status"
          className="mt-8 rounded-xl border border-border-soft bg-surface p-8 text-center"
        >
          <p className="font-medium">هنوز داده‌ای برای نمایش وجود ندارد.</p>
          <p className="mt-1 text-sm text-muted">
            با شروع ثبت رویدادها (شروع آزمون، مشاهده نتایج، کلیک روی عطر) این بخش فعال می‌شود.
          </p>
        </div>
      ) : (
        <>
          {/* --- KPI cards --- */}
          <section aria-label="شاخص‌های کلیدی" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Funnel step 0: how many shoppers saw the widget at all. */}
            <KpiCard label="بازدید ویجت" value={data.summary.widgetViewed} />
            <KpiCard label="شروع آزمون" value={data.summary.quizStarted} />
            <KpiCard label="تکمیل آزمون" value={data.summary.quizCompleted} />
            <KpiCard
              label="نرخ تکمیل آزمون"
              value={data.completionRate === null ? null : Math.round(data.completionRate)}
              isPercent
            />
          </section>

          {/* --- session-joined funnel --- */}
          <section className="mt-10">
            <h2 className="font-heading text-lg font-bold">قیف تلاش‌ها</h2>
            <p className="mb-3 mt-1 text-xs leading-6 text-muted">
              بر اساس تلاش‌های دارای شناسهٔ نشست؛ رویدادهای بدون شناسه در این بخش
              شمرده نمی‌شوند و شمارش کلی رویدادها در بالا دست‌نخورده است.
            </p>
            <div className="mt-4 flex flex-col gap-4">
              <FunnelBar label="شروع آزمون" count={funnel.started} max={funnelMax} />
              <FunnelBar
                label="تکمیل آزمون"
                rate={funnel.completionRate}
                rateLabel="از شروع"
                count={funnel.completed}
                max={funnelMax}
              />
              <FunnelBar
                label="مشاهدهٔ نتیجه"
                rate={funnel.resultViewRate}
                rateLabel="از تکمیل"
                count={funnel.resultViewed}
                max={funnelMax}
              />
              <FunnelBar
                label="نمایش پیشنهادها"
                rate={recommendationsRate}
                rateLabel="از مشاهده"
                count={funnel.recommendationsShown}
                max={funnelMax}
              />
              <FunnelBar
                label="کلیک روی عطر"
                rate={funnel.clickRate}
                rateLabel="از مشاهده"
                count={funnel.perfumeClicked}
                max={funnelMax}
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiCard
                label="تکمیل از شروع"
                value={
                  data.sessionFunnel.completionRate === null
                    ? null
                    : Math.round(data.sessionFunnel.completionRate)
                }
                isPercent
              />
              <KpiCard
                label="مشاهدهٔ نتیجه از تکمیل"
                value={
                  data.sessionFunnel.resultViewRate === null
                    ? null
                    : Math.round(data.sessionFunnel.resultViewRate)
                }
                isPercent
              />
              <KpiCard
                label="کلیک از مشاهدهٔ نتیجه"
                value={
                  data.sessionFunnel.clickRate === null
                    ? null
                    : Math.round(data.sessionFunnel.clickRate)
                }
                isPercent
              />
            </div>
          </section>

          {/* --- top recommended perfumes --- */}
          <section className="mt-10">
            <h2 className="mb-3 font-heading text-lg font-bold">عطرهای پرتکرار در پیشنهادها</h2>
            {data.topPerfumes.length === 0 ? (
              <p className="rounded-xl border border-border-soft bg-surface p-4 text-sm text-muted">
                هنوز داده‌ای برای نمایش وجود ندارد.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border-soft">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    عطرهای پرتکرار در پیشنهادها و نرخ کلیک آن‌ها
                  </caption>
                  <thead>
                    <tr className="bg-surface-2 text-right">
                      <th scope="col" className="px-3 py-2">رتبه</th>
                      <th scope="col" className="px-3 py-2">عطر</th>
                      <th scope="col" className="px-3 py-2">برند</th>
                      <th scope="col" className="px-3 py-2">تعداد نمایش در پیشنهادها</th>
                      <th scope="col" className="px-3 py-2">تعداد کلیک</th>
                      <th scope="col" className="px-3 py-2">نرخ کلیک</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPerfumes.map((row, index) => (
                      <tr key={row.perfumeId} className="border-t border-border-soft">
                        <td className="px-3 py-2 tnum">{toPersianDigits(index + 1)}</td>
                        <td className="px-3 py-2 font-medium">{row.name}</td>
                        <td className="px-3 py-2">{row.brand}</td>
                        <td className="px-3 py-2 tnum">{toPersianDigits(row.shownCount)}</td>
                        <td className="px-3 py-2 tnum">{toPersianDigits(row.clickCount)}</td>
                        <td className="px-3 py-2 tnum">
                          {row.shownCount === 0
                            ? "—"
                            : formatPersianPercent(
                                Math.round((row.clickCount / row.shownCount) * 100),
                              )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* --- daily roll-up --- */}
          <section className="mt-10">
            <h2 className="mb-3 font-heading text-lg font-bold">روند روزانه</h2>
            {data.daily.length > 0 ? (
              <>
                <p className="mb-3 text-xs text-muted">شروع آزمون در هر روز</p>
                <DailyChart rows={data.daily} />
              </>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-border-soft">
              <table className="w-full text-sm">
                <caption className="sr-only">رویدادهای هر روز در بازه انتخابی</caption>
                <thead>
                  <tr className="bg-surface-2 text-right">
                    <th scope="col" className="px-3 py-2">تاریخ</th>
                    <th scope="col" className="px-3 py-2">شروع آزمون</th>
                    <th scope="col" className="px-3 py-2">تکمیل آزمون</th>
                    <th scope="col" className="px-3 py-2">مشاهده نتایج</th>
                    <th scope="col" className="px-3 py-2">کلیک</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((row) => (
                    <tr key={row.date} className="border-t border-border-soft">
                      <td className="px-3 py-2 tnum">{toPersianDigits(row.date)}</td>
                      <td className="px-3 py-2 tnum">{toPersianDigits(row.quizStarted)}</td>
                      <td className="px-3 py-2 tnum">{toPersianDigits(row.quizCompleted)}</td>
                      <td className="px-3 py-2 tnum">{toPersianDigits(row.resultViewed)}</td>
                      <td className="px-3 py-2 tnum">{toPersianDigits(row.perfumeClicked)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <p className="mt-10 text-xs leading-7 text-muted">
        این آمار از رویدادهای ناشناس ثبت‌شده محاسبه می‌شود؛ تقریبی است و برای تحلیل
        رفتار فردی کاربرد ندارد.
      </p>
    </main>
  );
}

/**
 * One funnel stage as a proportional gold bar.
 *
 * The bar is decoration (`aria-hidden`): the stage label, the count and the
 * stage-to-stage rate are real text, so the information survives without it.
 * Width is relative to the largest stage (`max`), and a zero count renders a
 * 0%-wide bar rather than disappearing — «۰» is a real reading.
 */
/**
 * The funnel and the daily chart share one gold: marker gold lightening into
 * accent, exactly the closeness bar's fill on /result.
 */
const GOLD_BAR_GRADIENT =
  "linear-gradient(to left, var(--marker-gold) 0%, color-mix(in srgb, var(--marker-gold) 55%, var(--accent)) 60%, var(--accent) 100%)";

/** UTC weekday names, indexed by `Date.prototype.getUTCDay()` (0 = Sunday). */
const PERSIAN_WEEKDAYS = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
  "شنبه",
] as const;

/**
 * Daily quiz starts as gold columns — the same rows, in the same order, that
 * the table below renders. The weekday is read in UTC from the ISO date, the
 * same UTC-day convention `getDailyAnalytics` buckets by.
 *
 * Presentational only: the count and the weekday are real text in every
 * column, so the bar itself is `aria-hidden` decoration. Empty `rows` renders
 * nothing (the table still renders on its own).
 */
function DailyChart({ rows }: { rows: AnalyticsDashboardData["daily"] }) {
  if (rows.length === 0) {
    return null;
  }

  const max = Math.max(...rows.map((row) => row.quizStarted), 0);

  return (
    <div
      role="group"
      aria-label="شروع آزمون در هر روز"
      className="mb-6 mt-1 flex items-end gap-1.5 sm:gap-3"
    >
      {rows.map((row) => {
        const height = max === 0 ? 0 : Math.round((row.quizStarted / max) * 100);
        const weekday =
          PERSIAN_WEEKDAYS[new Date(`${row.date}T00:00:00Z`).getUTCDay()];

        return (
          <div
            key={row.date}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
          >
            <span className="tnum text-xs font-semibold text-accent">
              {toPersianDigits(row.quizStarted)}
            </span>
            <div aria-hidden="true" className="flex h-28 w-full items-end">
              <div
                className="w-full rounded-t-md"
                style={{
                  height: `${height}%`,
                  backgroundImage: GOLD_BAR_GRADIENT,
                }}
              />
            </div>
            <span className="w-full truncate text-center text-[0.65rem] text-muted">
              {weekday}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FunnelBar({
  label,
  rate,
  rateLabel,
  count,
  max,
}: {
  label: string;
  rate?: number | null;
  rateLabel?: string;
  count: number;
  max: number;
}) {
  const width = max === 0 ? 0 : Math.round((count / max) * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {rateLabel === undefined ? null : (
            <span className="text-xs text-muted">
              {rate === null || rate === undefined
                ? "—"
                : `${formatPersianPercent(rate)} ${rateLabel}`}
            </span>
          )}
        </div>
        <span className="tnum text-sm font-semibold text-accent">
          {toPersianDigits(count)}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="h-[22px] w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            backgroundImage: GOLD_BAR_GRADIENT,
          }}
        />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  isPercent = false,
}: {
  label: string;
  value: number | null;
  isPercent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border-soft bg-surface p-4">
      {/* Label then value in DOM order — that is the whole accessible read.
          The value used to carry aria-label={label}, which (where honoured)
          replaced the number with the label a second time. */}
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tnum text-accent">
        {value === null ? "—" : isPercent ? formatPersianPercent(value) : toPersianDigits(value)}
      </p>
    </div>
  );
}
