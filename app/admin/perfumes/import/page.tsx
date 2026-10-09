import Link from "next/link";

import { getActiveStores } from "@/lib/admin/repository";
import AdminShell from "@/components/admin/AdminShell";
import CsvImportFlow from "@/components/admin/CsvImportFlow";
import { requireAdmin } from "@/lib/admin/server-access";

/**
 * Phase 6B: CSV import page (server component).
 *
 * Server-side admin gate: unauthenticated requests are redirected to the
 * gate page before anything renders. Loads the active stores server-side
 * and hands them to the client flow component (upload → preview → confirm).
 * The page itself performs no mutation; all writes happen in the confirm
 * server action's transaction.
 */
export const metadata = {
  title: "ورود گروهی عطرها",
  robots: { index: false, follow: false },
};

export default async function ImportPage() {
  await requireAdmin("/admin/perfumes/import");

  const stores = await getActiveStores();

  if (stores.length === 0) {
    return (
      <AdminShell
        title="ورود گروهی عطرها"
        current="perfumes"
        width="md"
      >
        <div
          role="status"
          className="rounded-[var(--radius-lg)] border border-border-soft bg-surface p-6 text-center"
        >
          <p className="text-sm font-medium">هنوز فروشگاه فعالی وجود ندارد.</p>
          <p className="mt-1 text-xs leading-7 text-muted">
            برای ورود گروهی، ابتدا یک فروشگاه فعال لازم است.
          </p>
        </div>
        <Link
          href="/admin/perfumes"
          className="btn-primary flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-medium sm:self-start"
        >
          بازگشت به مدیریت عطرها
        </Link>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="ورود گروهی عطرها"
      description="فایل CSV را بارگذاری کنید، پیش‌نمایش را بررسی کنید و سپس وارد کردن را تأیید کنید."
      current="perfumes"
      width="xl"
    >
      <CsvImportFlow stores={stores} />
    </AdminShell>
  );
}
