import { notFound } from "next/navigation";

import type { Metadata } from "next";

import AnalyticsRangeNav from "@/components/admin/AnalyticsRangeNav";
import {
  getAnalyticsDashboardData,
  parseAnalyticsRange,
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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-6 flex items-center gap-4">
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
            <KpiCard label="شروع آزمون" value={data.summary.quizStarted} />
            <KpiCard label="تکمیل آزمون" value={data.summary.quizCompleted} />
            <KpiCard
              label="نرخ تکمیل آزمون"
              value={data.completionRate === null ? null : Math.round(data.completionRate)}
              isPercent
            />
          </section>

          {/* --- top recommended perfumes --- */}
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-bold">عطرهای پرتکرار در پیشنهادها</h2>
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
                        <td className="px-3 py-2 tnum">{toPersianDigits(row.recommendationCount)}</td>
                        <td className="px-3 py-2 tnum">{toPersianDigits(row.clickCount)}</td>
                        <td className="px-3 py-2 tnum">
                          {row.recommendationCount === 0
                            ? "—"
                            : formatPersianPercent(
                                Math.round((row.clickCount / row.recommendationCount) * 100),
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
            <h2 className="mb-3 text-lg font-bold">روند روزانه</h2>
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
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tnum" aria-label={label}>
        {value === null ? "—" : isPercent ? formatPersianPercent(value) : toPersianDigits(value)}
      </p>
    </div>
  );
}
