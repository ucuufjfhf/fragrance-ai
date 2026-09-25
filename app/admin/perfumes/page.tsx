import { logoutAdminAccessAction } from "@/app/admin/access/actions";

import { headers } from "next/headers";
import Link from "next/link";

import { requireAdmin } from "@/lib/admin/server-access";

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
      <AdminShell>
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
    <AdminShell>
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">مدیریت عطرها</h1>
        <p className="text-sm text-muted">
          عطرهای فروشگاه «{selectedStore.name}» — {toPersianDigits(perfumes.length)} عطر
        </p>
      </header>

      {created ? (
        <p role="status" className="rounded-2xl border border-accent/40 bg-accent-soft p-4 text-sm text-accent">
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
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border-soft text-muted hover:border-accent/40 hover:text-foreground"
              }`}
            >
              {store.name}
            </Link>
          ))}
        </div>
      </section>

      <Link
        href={`/admin/perfumes/new?store=${selectedStore.id}`}
        className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-5 font-medium text-background transition-colors hover:bg-accent/90 sm:w-fit sm:px-8"
      >
        + افزودن عطر جدید
      </Link>

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
              className="flex flex-col gap-3 rounded-3xl border border-border-soft bg-surface p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{perfume.name}</span>
                  <span className="text-sm text-muted">— {perfume.brand}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{GENDER_LABELS[perfume.gender] ?? perfume.gender}</span>
                  {perfume.price !== null ? (
                    <span>· {toPersianDigits(perfume.price.toLocaleString("en-US"))} تومان</span>
                  ) : null}
                  {perfume.profile?.family ? <span>· {perfume.profile.family}</span> : null}
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
                  className="rounded-full border border-border-soft px-4 py-2 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground"
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

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      {children}
      <form action={logoutAdminAccessAction} className="self-end">
        <button type="submit" className="text-sm underline">خروج از مدیریت</button>
      </form>
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-3xl border border-border-soft bg-surface p-8 text-center">
      <span aria-hidden="true" className="text-4xl">🗃️</span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm leading-8 text-muted">{body}</p>
    </section>
  );
}
