"use client";

import Link from "next/link";
import { useState } from "react";

import type { AdminStoreView } from "@/lib/admin/repository";

/**
 * Client flow for the Phase 6B CSV import (§14):
 *   store select → file upload → preview → confirm → success summary.
 *
 * The component holds no database or AI imports — it only calls the two
 * server actions. The confirm button is disabled whenever the preview
 * contains ANY invalid/duplicate row; the raw CSV (not a "validated" flag)
 * is what the confirm action re-validates server-side.
 */

interface PreviewRow {
  row: number;
  name: string;
  brand: string;
  slug: string;
  gender: string;
  status: "valid" | "invalid" | "duplicate";
  errors: Array<{ column?: string; message: string }>;
}

interface PreviewState {
  ok: true;
  raw: string;
  rows: PreviewRow[];
  summary: { totalRows: number; validRows: number; errorRows: number };
}

interface ActionError {
  error: string;
  details?: Array<{ row?: number; column?: string; message: string }>;
}

type PreviewResult = PreviewState | (ActionError & { ok?: false });
type ConfirmResult = { ok: true; importedCount: number } | (ActionError & { ok: false });

const STATUS_LABEL: Record<PreviewRow["status"], string> = {
  valid: "✓ معتبر",
  invalid: "❌ دارای خطا",
  duplicate: "❌ تکراری",
};

const STATUS_CLASS: Record<PreviewRow["status"], string> = {
  valid: "text-emerald-700 dark:text-emerald-400",
  invalid: "text-red-700 dark:text-red-400",
  duplicate: "text-amber-700 dark:text-amber-400",
};

export default function CsvImportFlow({ stores }: { stores: AdminStoreView[] }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [submitting, setSubmitting] = useState<"preview" | "confirm" | null>(null);

  const hasErrors =
    preview !== null && preview.rows.some((entry) => entry.status !== "valid");

  async function handlePreview(formData: FormData) {
    setSubmitting("preview");
    setConfirmResult(null);

    try {
      const { previewCsvAction } = await import("@/app/admin/perfumes/import/actions");
      const result = (await previewCsvAction(undefined, formData)) as PreviewResult;

      setPreview("ok" in result && result.ok ? result : null);

      if (!("ok" in result && result.ok)) {
        const failure = result as ActionError;

        setPreview(null);
        setConfirmResult({ ok: false, error: failure.error, details: failure.details });
      }
    } finally {
      setSubmitting(null);
    }
  }

  async function handleConfirm() {
    if (preview === null || storeId === "") return;

    setSubmitting("confirm");

    try {
      const formData = new FormData();

      formData.set("storeId", storeId);
      formData.set("raw", preview.raw);

      const { confirmCsvAction } = await import("@/app/admin/perfumes/import/actions");
      const result = (await confirmCsvAction(formData)) as ConfirmResult;

      setConfirmResult(result);

      if (result.ok) {
        setPreview(null);
      }
    } finally {
      setSubmitting(null);
    }
  }

  if (confirmResult !== null && confirmResult.ok) {
    return (
      <section aria-live="polite" className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 dark:border-emerald-700 dark:bg-emerald-950">
        <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
          وارد کردن عطرها با موفقیت انجام شد.
        </h2>
        <p className="mt-2 text-emerald-800 dark:text-emerald-200">
          تعداد واردشده: {confirmResult.importedCount.toLocaleString("fa-IR")}
        </p>
        <Link
          href={`/admin/perfumes?store=${encodeURIComponent(storeId)}`}
          className="mt-4 inline-block rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          مشاهده فهرست عطرها
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handlePreview(new FormData(event.currentTarget));
        }}
        className="space-y-4 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800"
      >
        <div>
          <label htmlFor="csv-store" className="mb-1 block text-sm font-medium">
            فروشگاه
          </label>
          <select
            id="csv-store"
            name="storeId"
            value={storeId}
            onChange={(event) => setStoreId(event.target.value)}
            className="w-full max-w-sm rounded-lg border border-neutral-300 bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="csv-file" className="mb-1 block text-sm font-medium">
            فایل CSV
          </label>
          <input
            id="csv-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="w-full max-w-sm rounded-lg border border-neutral-300 bg-white px-3 py-2 file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1 dark:border-neutral-700 dark:bg-neutral-900 dark:file:bg-neutral-800"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            حداکثر حجم: ۵ مگابایت — حداکثر ردیف: ۵٬۰۰۰
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting !== null}
          className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {submitting === "preview" ? "در حال بررسی..." : "بارگذاری و پیش‌نمایش"}
        </button>
      </form>

      {confirmResult !== null && !confirmResult.ok && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <p className="font-medium text-red-900 dark:text-red-100">{(confirmResult as ActionError).error}</p>
          {(() => {
            const failure = confirmResult as ActionError;
            const details = failure.details ?? [];

            return details.length > 0 ? (
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-red-800 dark:text-red-200">
                {details.slice(0, 20).map((detail, index) => (
                  <li key={index}>
                    {detail.row !== undefined && <>ردیف {detail.row.toLocaleString("fa-IR")}: </>}
                    {detail.column && <>ستون {detail.column} — </>}
                    {detail.message}
                  </li>
                ))}
              </ul>
            ) : null;
          })()}
        </div>
      )}

      {preview !== null && (
        <section aria-live="polite" className="space-y-4">
          <div className="flex flex-wrap gap-4 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <span>تعداد کل ردیف‌ها: <strong>{preview.summary.totalRows.toLocaleString("fa-IR")}</strong></span>
            <span className="text-emerald-700 dark:text-emerald-400">
              تعداد معتبر: <strong>{preview.summary.validRows.toLocaleString("fa-IR")}</strong>
            </span>
            <span className="text-red-700 dark:text-red-400">
              تعداد خطادار: <strong>{preview.summary.errorRows.toLocaleString("fa-IR")}</strong>
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <caption className="sr-only">پیش‌نمایش ردیف‌های فایل CSV</caption>
              <thead>
                <tr className="bg-neutral-100 text-right dark:bg-neutral-800">
                  <th scope="col" className="px-3 py-2">ردیف</th>
                  <th scope="col" className="px-3 py-2">نام</th>
                  <th scope="col" className="px-3 py-2">برند</th>
                  <th scope="col" className="px-3 py-2">نامک</th>
                  <th scope="col" className="px-3 py-2">جنسیت</th>
                  <th scope="col" className="px-3 py-2">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((entry) => (
                  <tr key={entry.row} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="px-3 py-2">{entry.row.toLocaleString("fa-IR")}</td>
                    <td className="px-3 py-2">{entry.name || "—"}</td>
                    <td className="px-3 py-2">{entry.brand || "—"}</td>
                    <td className="px-3 py-2" dir="ltr">{entry.slug || "—"}</td>
                    <td className="px-3 py-2">{entry.gender || "—"}</td>
                    <td className={`px-3 py-2 font-medium ${STATUS_CLASS[entry.status]}`}>
                      {STATUS_LABEL[entry.status]}
                      {entry.errors.length > 0 && (
                        <ul className="mt-1 list-inside list-disc text-xs font-normal">
                          {entry.errors.slice(0, 3).map((error, index) => (
                            <li key={index}>
                              {error.column && <>{error.column}: </>}
                              {error.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasErrors ? (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              به دلیل وجود خطا، امکان وارد کردن فایل وجود ندارد. لطفاً فایل را اصلاح و دوباره بارگذاری کنید.
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={submitting !== null}
              className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              {submitting === "confirm" ? "در حال وارد کردن..." : "تأیید و وارد کردن"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
