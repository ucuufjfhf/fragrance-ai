"use server";

import { CSV_MAX_FILE_BYTES } from "@/lib/admin/csv/contract";
import { confirmCsvImport, previewCsvImport } from "@/lib/admin/csv/service";
import { requireAdminAction } from "@/lib/admin/server-access";

/**
 * Server actions for the Phase 6B CSV import flow.
 *
 * The browser only ever sends raw file text + the selected store id; every
 * action first performs the admin access gate check (`requireAdminAction` —
 * unauthenticated callers are redirected to the gate page), then all
 * parsing, validation, duplicate detection and the atomic transaction happen
 * server-side. Preview never touches the DB with a write; only the explicit
 * confirm action runs the transaction.
 */

const MAX_FORM_FILE_BYTES = CSV_MAX_FILE_BYTES;

export interface CsvActionError {
  ok: false;
  error: string;
  details?: Array<{ row?: number; column?: string; message: string }>;
}

/** Reads and size-checks the uploaded file; returns its UTF-8 text. */
async function readUpload(formData: FormData): Promise<{ ok: true; text: string } | CsvActionError> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "فایل CSV انتخاب نشده است." };
  }

  if (file.size > MAX_FORM_FILE_BYTES) {
    return { ok: false as const, error: `حجم فایل بیشتر از حد مجاز است (حداکثر ${Math.round(MAX_FORM_FILE_BYTES / (1024 * 1024))} مگابایت).` };
  }

  const text = await file.text();

  if (text.trim() === "") {
    return { ok: false as const, error: "فایل CSV خالی است." };
  }

  return { ok: true, text };
}

/**
 * Preview action: parse + validate + duplicate detection only.
 * Performs NO database mutation — the only DB access is a read-only slug
 * probe inside `previewCsvImport`.
 */
export async function previewCsvAction(
  _prev: unknown,
  formData: FormData,
): Promise<CsvActionError | { ok: true; raw: string; rows: unknown[]; summary: { totalRows: number; validRows: number; errorRows: number } }> {
  await requireAdminAction();

  const storeId = String(formData.get("storeId") ?? "").trim();

  if (storeId === "") {
    return { ok: false as const, error: "ابتدا یک فروشگاه انتخاب کنید." };
  }

  const upload = await readUpload(formData);

  if (!upload.ok) {
    return { ok: false as const, error: upload.error };
  }

  const preview = await previewCsvImport(upload.text, storeId);

  if (!preview.ok) {
    return { ok: false as const, error: preview.error, details: preview.details };
  }

  return {
    ok: true,
    raw: upload.text,
    rows: preview.rows,
    summary: preview.summary,
  };
}

/**
 * Confirm action: the atomic import.
 * The raw CSV is re-validated server-side inside `confirmCsvImport`; a
 * client-asserted "validated" flag is never trusted. The transaction imports
 * all rows or none.
 */
export async function confirmCsvAction(formData: FormData): Promise<CsvActionError | { ok: true; importedCount: number }> {
  await requireAdminAction();

  const storeId = String(formData.get("storeId") ?? "").trim();
  const raw = String(formData.get("raw") ?? "");

  if (storeId === "") {
    return { ok: false as const, error: "ابتدا یک فروشگاه انتخاب کنید." };
  }

  if (raw.trim() === "") {
    return { ok: false as const, error: "داده‌ای برای وارد کردن وجود ندارد؛ فایل را دوباره بارگذاری کنید." };
  }

  const result = await confirmCsvImport(raw, storeId);

  if (!result.ok) {
    return { ok: false as const, error: result.error, details: result.details };
  }

  return { ok: true, importedCount: result.importedCount };
}
