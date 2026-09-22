import Link from "next/link";

import { getActiveStores } from "@/lib/admin/repository";
import CsvImportFlow from "@/components/admin/CsvImportFlow";

/**
 * Phase 6B: CSV import page (server component).
 *
 * Loads the active stores server-side and hands them to the client flow
 * component (upload → preview → confirm). The page itself performs no
 * mutation; all writes happen in the confirm server action's transaction.
 */
export const metadata = {
  title: "ورود گروهی عطرها",
  robots: { index: false, follow: false },
};

export default async function ImportPage() {
  const stores = await getActiveStores();

  if (stores.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-bold">ورود گروهی عطرها</h1>
        <div
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="font-medium">هنوز فروشگاه فعالی وجود ندارد.</p>
          <p className="mt-2 text-sm">برای ورود گروهی، ابتدا یک فروشگاه فعال لازم است.</p>
        </div>
        <Link
          href="/admin/perfumes"
          className="mt-6 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-white dark:text-neutral-900"
        >
          بازگشت به مدیریت عطرها
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">ورود گروهی عطرها</h1>
      <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
        فایل CSV را بارگذاری کنید، پیش‌نمایش را بررسی کنید و سپس وارد کردن را تأیید کنید.
      </p>
      <CsvImportFlow stores={stores} />
    </main>
  );
}
