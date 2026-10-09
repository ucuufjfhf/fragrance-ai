import { ArchiveMark, CheckMark } from "@/components/ui-icons";

import { headers } from "next/headers";
import Link from "next/link";

import { requireAdmin } from "@/lib/admin/server-access";

import AdminShell from "@/components/admin/AdminShell";
import BulkProfilingPanel from "@/components/admin/BulkProfilingPanel";
import PerfumeToggles from "@/components/admin/PerfumeToggles";
import WidgetEmbedCode from "@/components/admin/WidgetEmbedCode";
import { getOpenBulkJobForStoreAction } from "@/app/admin/perfumes/bulk-actions";
import { AI_BULK_MAX_ITEMS } from "@/lib/admin/bulk/contract";
import { resolveBulkMaxItems } from "@/lib/admin/bulk/helpers";
import {
  getActiveStores,
  getPerfumesForStore,
} from "@/lib/admin/repository";
import { toPersianDigits } from "@/lib/persian";
import type { Metadata } from "next";

/** Canonical path of this page, reused as the post-unlock redirect target. */
const ADMIN_PERFUMES_PATH = "/admin/perfumes";

/**
 * GET /admin/perfumes — the internal admin product list (Phase 6A).
 *
 * Server-side admin gate: the page renders only for a valid admin cookie
 * (unauthenticated requests are redirected to the gate page). Every query
 * is scoped to the selected `storeId` — store isolation is mandatory and
 * mirrors the Phase 3 pattern.
 */

export const metadata: Metadata = {
  title: "مدیریت عطرها | عطر خودتو پیدا کن",
  robots: { index: false, follow: false },
};

interface AdminPerfumesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const GENDER_LABELS: Record<string, string> = {
  MEN: "مردانه",
  WOMEN: "زنانه",
  UNISEX: "یونیسکس",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPerfumesPage({ searchParams }: AdminPerfumesPageProps) {
  await requireAdmin(ADMIN_PERFUMES_PATH);

  const params = await searchParams;
  const storeId = first(params.store)?.trim() ?? "";

  const stores = await getActiveStores();

  if (stores.length === 0) {
    return (
      <AdminShell
        title="مدیریت عطرها"
        description="عطرهای هر فروشگاه، وضعیت موجودی و ورود گروهی"
        current="perfumes"
      >
        <EmptyState
          title="فروشگاه فعالی وجود ندارد"
          body="برای مدیریت عطرها، اول یک فروشگاه فعال در پایگاه داده ثبت شود."
        />
      </AdminShell>
    );
  }

  // Fall back to the first active store when the query param is missing/unknown.
  const selectedStore =
    stores.find((store) => store.id === storeId) ?? stores[0];

  const perfumes = await getPerfumesForStore(selectedStore.id);
  const created = first(params.created) === "1";

  // Phase 12.5: bulk AI profiling — restore an in-flight job (DB truth) and
  // resolve the selection ceiling server-side (env-overridable, bounded).
  const [openBulkJob, bulkMaxItems] = await Promise.all([
    getOpenBulkJobForStoreAction(selectedStore.id),
    Promise.resolve(resolveBulkMaxItems(process.env.AI_BULK_MAX_ITEMS, AI_BULK_MAX_ITEMS)),
  ]);

  // Public app URL for the widget install snippet (§29): the documented
  // deployment env var, with the request origin as the local-dev fallback.
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${protocol}://${host}`;

  return (
    <AdminShell
      title="مدیریت عطرها"
      description={`عطرهای فروشگاه «${selectedStore.name}» — ${toPersianDigits(perfumes.length)} عطر`}
      current="perfumes"
    >
      {created ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border-soft bg-surface p-4 text-sm text-foreground"
        >
          <CheckMark className="h-4 w-4 shrink-0 text-champagne-deep" />
          عطر با موفقیت ثبت شد.
        </p>
      ) : null}

      <WidgetEmbedCode storeId={selectedStore.id} appUrl={appUrl} />

      <section className="flex flex-col gap-2" aria-label="انتخاب فروشگاه">
        <span className="text-sm text-muted">فروشگاه:</span>
        <div className="flex flex-wrap gap-2">
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/admin/perfumes?store=${store.id}`}
              aria-current={store.id === selectedStore.id ? "page" : undefined}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                store.id === selectedStore.id
                  ? "border-champagne-deep/50 bg-champagne/15 text-ink"
                  : "border-border-soft text-muted hover:border-champagne-deep/40 hover:text-foreground"
              }`}
            >
              {store.name}
            </Link>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={`/admin/perfumes/new?store=${selectedStore.id}`}
          className="btn-primary flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-medium sm:w-fit"
        >
          + افزودن عطر جدید
        </Link>
        <Link
          href={`/admin/perfumes/import?store=${selectedStore.id}`}
          className="btn-ghost flex min-h-12 items-center justify-center rounded-full px-6 text-sm sm:w-fit"
        >
          ورود گروهی با CSV
        </Link>
      </div>

      <BulkProfilingPanel
        storeId={selectedStore.id}
        perfumes={perfumes.map((perfume) => ({
          id: perfume.id,
          name: perfume.name,
          brand: perfume.brand,
        }))}
        initialOpenJob={openBulkJob}
        maxItems={bulkMaxItems}
      />

      {perfumes.length === 0 ? (
        <EmptyState
          title="هنوز عطری برای این فروشگاه ثبت نشده است."
          body="با دکمهٔ «افزودن عطر جدید» اولین محصول را ثبت کنید."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {perfumes.map((perfume) => (
            <li
              key={perfume.id}
              className={`flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-4 transition-colors hover:border-champagne-deep/40 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
                perfume.active ? "" : "opacity-70"
              }`}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-base text-ink">{perfume.name}</span>
                  <span className="text-xs text-muted">{perfume.brand}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{GENDER_LABELS[perfume.gender] ?? perfume.gender}</span>
                  {perfume.price !== null ? (
                    <span className="tnum">
                      {toPersianDigits(perfume.price.toLocaleString("en-US"))} تومان
                    </span>
                  ) : null}
                  {perfume.profile?.family ? (
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5">
                      {perfume.profile.family}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <PerfumeToggles
                  perfumeId={perfume.id}
                  storeId={selectedStore.id}
                  active={perfume.active}
                  inStock={perfume.inStock}
                />
                <Link
                  href={`/admin/perfumes/${perfume.id}/edit?store=${selectedStore.id}`}
                  className="btn-ghost rounded-full px-4 py-2 text-xs"
                >
                  ویرایش
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-8 text-center">
      <ArchiveMark className="h-8 w-8 text-champagne-deep/70" />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm leading-8 text-muted">{body}</p>
    </section>
  );
}
