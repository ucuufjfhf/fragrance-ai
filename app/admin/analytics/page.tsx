import Link from "next/link";

import { getActiveStores } from "@/lib/admin/repository";
import {
  getAnalyticsDashboardData,
  parseAnalyticsRange,
  type AnalyticsRangePreset,
} from "@/lib/analytics/service";
import AdminShell from "@/components/admin/AdminShell";
import AnalyticsRangeNav from "@/components/admin/AnalyticsRangeNav";
import { formatPersianPercent, toPersianDigits } from "@/lib/persian";
import type { Metadata } from "next";

import { CompassMark } from "@/components/ui-icons";
import { requireAdmin } from "@/lib/admin/server-access";

/**
 * GET /admin/analytics — the Phase 7 dashboard (server component).
 *
 * Server-side admin gate: unauthenticated requests are redirected to the
 * gate page before anything renders. All aggregation happens server-side
 * from persisted AnalyticsEvent rows (never fake data); the browser
 * receives only computed numbers. Every query is scoped to the selected
 * store — a store's analytics are invisible to another store's view (§13).
 */

export const metadata: Metadata = {
  title: "تحلیل عملکرد | عطر خودتو پیدا کن",
  robots: { index: false, follow: false },
};

interface AdminAnalyticsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Reads the store/range params defensively; unknown values fall back sanely. */
function readParams(
  params: Record<string, string | string[] | undefined>,
): { storeId: string; range: AnalyticsRangePreset } {
  const rawStore = params.store;
  const storeId = (Array.isArray(rawStore) ? rawStore[0] : rawStore) ?? "";

  return { storeId, range: parseAnalyticsRange(params.range) };
}

export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  const params = readParams(await searchParams);

  await requireAdmin(`/admin/analytics?store=${encodeURIComponent(params.storeId)}&range=${encodeURIComponent(params.range)}`);

  const stores = await getActiveStores();

  if (stores.length === 0) {
    return (
      <AdminShell
        title="تحلیل عملکرد"
        description="آمار ناشناس آزمون‌ها، پیشنهادها و کلیک‌ها"
        current="analytics"
        width="xl"
      >
        <section
          role="status"
          className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-8 text-center"
        >
          <CompassMark className="h-7 w-7 text-champagne-deep/70" />
          <p className="text-sm text-foreground">هنوز فروشگاه فعالی وجود ندارد.</p>
          <p className="text-xs leading-7 text-muted">
            برای دیدن تحلیل عملکرد، ابتدا یک فروشگاه فعال لازم است.
          </p>
          <Link
            href="/admin/perfumes"
            className="btn-primary mt-1 flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-medium"
          >
            بازگشت به مدیریت عطرها
          </Link>
        </section>
      </AdminShell>
    );
  }

  // Default to the first active store when the URL carries none/unknown.
  const selectedStore =
    stores.find((store) => store.id === params.storeId) ?? stores[0];
  const data = await getAnalyticsDashboardData(selectedStore.id, params.range);

  return (
    <AdminShell
      title="تحلیل عملکرد"
      description={`فروشگاه: ${selectedStore.name}`}
      current="analytics"
      width="xl"
    >

      {/* --- store selector (server-navigating links, like Phase 6A) --- */}
      <nav aria-label="انتخاب فروشگاه" className="flex flex-wrap gap-2">
        {stores.map((store) => (
          <Link
            key={store.id}
            href={`/admin/analytics?store=${encodeURIComponent(store.id)}&range=${data.range}`}
            aria-current={store.id === selectedStore.id ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              store.id === selectedStore.id
                ? "border-champagne-deep/50 bg-champagne/15 font-medium text-ink"
                : "border-border-soft text-muted hover:border-champagne-deep/40 hover:text-foreground"
            }`}
          >
            {store.name}
          </Link>
        ))}
      </nav>

      <AnalyticsRangeNav storeId={selectedStore.id} current={data.range} />

      {!data.hasData ? (
        <div
          role="status"
          className="mt-8 flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-8 text-center"
        >
          <CompassMark className="h-7 w-7 text-champagne-deep/70" />
          <p className="font-medium">هنوز داده‌ای برای نمایش وجود ندارد.</p>
          <p className="text-xs leading-7 text-muted">
            با شروع ثبت رویدادها (شروع آزمون، مشاهده نتایج، کلیک روی عطر) این بخش فعال می‌شود.
          </p>
        </div>
      ) : (
        <>
          {/* --- KPI cards --- */}
          <section aria-label="شاخص‌های کلیدی" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="شروع آزمون" value={data.summary.quizStarted} />
            <KpiCard label="تکمیل آزمون" value={data.summary.quizCompleted} />
            <KpiCard label="مشاهده نتایج" value={data.summary.resultViewed} />
            <KpiCard
              label="پیشنهادهای نمایش‌داده‌شده"
              value={data.summary.recommendationsShown}
            />
            <KpiCard label="کلیک روی عطر" value={data.summary.perfumeClicked} />
            <KpiCard
              label="نرخ تکمیل آزمون"
              value={data.completionRate === null ? null : Math.round(data.completionRate)}
              isPercent
            />
            <KpiCard
              label="نرخ کلیک روی پیشنهادها"
              value={data.clickRate === null ? null : Math.round(data.clickRate)}
              isPercent
            />
          </section>

          {/* --- top recommended perfumes --- */}
          <section className="mt-10">
            <h2 className="mb-3 font-heading text-lg text-ink">عطرهای پرتکرار در پیشنهادها</h2>
            {data.topPerfumes.length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-border-soft bg-surface p-4 text-sm text-muted">
                هنوز داده‌ای برای نمایش وجود ندارد.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border-soft bg-surface">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    عطرهای پرتکرار در پیشنهادها و نرخ کلیک آن‌ها
                  </caption>
                  <thead>
                    <tr className="bg-surface-2 text-right text-xs text-muted">
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
            <h2 className="mb-3 font-heading text-lg text-ink">روند روزانه</h2>
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border-soft bg-surface">
              <table className="w-full text-sm">
                <caption className="sr-only">رویدادهای هر روز در بازه انتخابی</caption>
                <thead>
                  <tr className="bg-surface-2 text-right text-xs text-muted">
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

      <p className="text-xs leading-7 text-muted">
        این آمار از رویدادهای ناشناس ثبت‌شده محاسبه می‌شود؛ تقریبی است و برای تحلیل
        رفتار فردی کاربرد ندارد.
      </p>
    </AdminShell>
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
    <div className="rounded-[var(--radius-md)] border border-border-soft bg-surface p-4">
      <p className="text-[0.7rem] text-muted">{label}</p>
      <p className="tnum mt-1 font-heading text-xl text-ink" aria-label={label}>
        {value === null ? "—" : isPercent ? formatPersianPercent(value) : toPersianDigits(value)}
      </p>
    </div>
  );
}
