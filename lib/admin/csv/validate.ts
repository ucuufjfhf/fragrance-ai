import {
  CSV_BOOLEAN_COLUMNS,
  CSV_DESCRIPTOR_COLUMNS,
  CSV_MATCHING_COLUMNS,
  CSV_METADATA_COLUMNS,
  CSV_OPTIONAL_PRODUCT_COLUMNS,
  CSV_REQUIRED_PRODUCT_COLUMNS,
} from "@/lib/admin/csv/contract";
import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import { SEASONS, OCCASIONS, validatePerfumePayload } from "@/lib/admin/validation";

/**
 * Row-level CSV validation (Phase 6B).
 *
 * Pure: converts a parsed CSV record into the exact payload shape consumed by
 * Phase 6A's `validatePerfumePayload` (the single validation authority — no
 * second validator is implemented here), then maps its field-keyed errors into
 * row-level errors carrying the row number and column name.
 */

/** `true`/`false` only — the explicit boolean contract from the spec. */
export function parseCsvBoolean(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();

  if (value === "true") return true;
  if (value === "false") return false;

  return null;
}

/** `Bergamot|Lavender|Cedar|Musk` → `["Bergamot", "Lavender", "Cedar", "Musk"]`; empty → `[]`. */
export function parseNotes(raw: string): string[] {
  return raw
    .split("|")
    .map((note) => note.trim())
    .filter((note) => note !== "");
}

export interface CsvRowError {
  row: number;
  column?: string;
  message: string;
}

export type RowConversionResult =
  | { ok: true; payload: unknown }
  | { ok: false; errors: CsvRowError[] };

const STORE_ID_COLUMN = "storeId";

/** Checks one 0–100 integer cell; appends a Persian error when invalid. */
function checkAxisCell(row: number, column: string, raw: string, errors: CsvRowError[], required: boolean): void {
  const value = raw.trim();

  if (value === "") {
    if (required) {
      errors.push({ row, column, message: "این ستون اجباری خالی است." });
    }
    return;
  }

  const numeric = Number(value);

  if (!Number.isInteger(numeric)) {
    errors.push({ row, column, message: "مقدار باید یک عدد صحیح بین 0 تا 100 باشد." });
    return;
  }

  if (numeric < 0 || numeric > 100) {
    errors.push({ row, column, message: "مقدار باید بین 0 تا 100 باشد." });
  }
}

/**
 * Converts one CSV data row into the Phase 6A payload shape, enforcing the
 * CSV-specific rules first (booleans, integer axes, `storeId` rejection).
 * Returns structured errors instead of throwing, so ALL rows can be validated
 * before preview rather than stopping at the first bad row.
 */
export function csvRecordToPayload(row: number, record: Record<string, string>): RowConversionResult {
  const errors: CsvRowError[] = [];

  for (const column of CSV_REQUIRED_PRODUCT_COLUMNS) {
    if ((record[column] ?? "").trim() === "") {
      errors.push({ row, column, message: "این ستون اجباری خالی است." });
    }
  }

  for (const column of CSV_MATCHING_COLUMNS) {
    checkAxisCell(row, column, record[column] ?? "", errors, true);
  }

  for (const column of CSV_DESCRIPTOR_COLUMNS) {
    checkAxisCell(row, column, record[column] ?? "", errors, false);
  }

  for (const column of CSV_BOOLEAN_COLUMNS) {
    const raw = (record[column] ?? "").trim();

    if (raw !== "" && parseCsvBoolean(raw) === null) {
      errors.push({ row, column, message: "مقدار باید «true» یا «false» باشد." });
    }
  }

  if (record[STORE_ID_COLUMN] !== undefined) {
    errors.push({
      row,
      column: STORE_ID_COLUMN,
      message: "ستون storeId مجاز نیست؛ فروشگاه هدف از انتخاب بالای صفحه گرفته می‌شود.",
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Map the CSV record into the Phase 6A payload shape. `validateProfile`
  // reads the axes flat off the profile object (`profile.social`, …), so no
  // nesting here — matching/descriptors separation happens inside the
  // validator, and shared dimensions (fresh/warm/…) stay single-valued.
  const profile: Record<string, unknown> = {};

  for (const column of CSV_MATCHING_COLUMNS) {
    profile[column] = Number(record[column].trim());
  }

  for (const column of CSV_DESCRIPTOR_COLUMNS) {
    const raw = (record[column] ?? "").trim();
    profile[column] = raw === "" ? 0 : Number(raw);
  }

  for (const column of CSV_METADATA_COLUMNS) {
    const raw = (record[column] ?? "").trim();

    if (raw === "") continue;

    profile[column] = column === "notes" ? parseNotes(raw) : raw;
  }

  const optional: Record<string, unknown> = {};

  for (const column of CSV_OPTIONAL_PRODUCT_COLUMNS) {
    const raw = (record[column] ?? "").trim();

    if (raw === "") continue;

    optional[column] = CSV_BOOLEAN_COLUMNS.includes(column) ? parseCsvBoolean(raw) : raw;
  }

  const payload = {
    name: record["name"].trim(),
    brand: record["brand"].trim(),
    slug: record["slug"].trim(),
    gender: record["gender"].trim(),
    price: record["price"].trim(),
    inStock: optional["inStock"] ?? true,
    active: optional["active"] ?? true,
    description: optional["description"],
    productUrl: optional["productUrl"],
    imageUrl: optional["imageUrl"],
    profile: {
      ...profile,
    },
  };

  return { ok: true, payload };
}

/**
 * Full row validation: CSV conversion + the Phase 6A validator.
 * Note: an absent/empty `gender` defaults to UNISEX in Phase 6A, but the CSV
 * contract requires it, so the empty check above already catches that case.
 */
export function validateCsvRow(row: number, record: Record<string, string>): CsvRowError[] {
  const converted = csvRecordToPayload(row, record);

  if (!converted.ok) {
    return converted.errors;
  }

  const validated = validatePerfumePayload(converted.payload);

  if (validated.ok) {
    return [];
  }

  // Phase 6A errors are a field → message map; profile axes are keyed by
  // their dimension name, everything else by its payload field name.
  return Object.entries(validated.errors).map(([field, message]) => ({
    row,
    column: field === "profile" || field === "form" ? undefined : field,
    message,
  }));
}

/** Exposed for tests: the enum lists the CSV contract must stay in sync with. */
export const CSV_ALLOWED_SEASONS = SEASONS;
export const CSV_ALLOWED_OCCASIONS = OCCASIONS;
export const CSV_MATCHING_DIMENSIONS = MATCHING_DIMENSIONS;
