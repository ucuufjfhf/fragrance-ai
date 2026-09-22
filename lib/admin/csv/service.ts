import { CSV_MAX_FILE_BYTES } from "@/lib/admin/csv/contract";
import { parseCsv } from "@/lib/admin/csv/parser";
import { csvRecordToPayload, validateCsvRow, type CsvRowError } from "@/lib/admin/csv/validate";
import { validatePerfumePayload, type AdminPerfumeInput } from "@/lib/admin/validation";
import { getPrisma } from "@/lib/db";

/**
 * Server-only CSV import service (Phase 6B).
 *
 * Two-phase flow with a hard no-mutation guarantee on the preview side:
 *
 *   1. `previewCsvImport`  — parses + validates + checks slug duplicates
 *      (a read-only slug query). Creates/updates/deletes NOTHING.
 *   2. `confirmCsvImport`  — receives the *original raw CSV text* (never a
 *      browser-asserted "validated" payload), re-parses and re-validates
 *      everything server-side, re-checks duplicates against the live DB
 *      (race window §17), then imports inside ONE `prisma.$transaction` —
 *      all rows or none, never a partial import.
 *
 * No AI provider is touched (§21): CSV values are authoritative.
 * Must never be imported from a client component (Prisma + DATABASE_URL).
 */

export interface CsvPreviewRow {
  row: number;
  name: string;
  brand: string;
  slug: string;
  gender: string;
  status: "valid" | "invalid" | "duplicate";
  errors: Array<{ column?: string; message: string }>;
}

export interface CsvPreviewSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
}

export type CsvPreviewResult =
  | {
      ok: true;
      /** Opaque handle the confirm step re-validates against — see §16. */
      raw: string;
      rows: CsvPreviewRow[];
      summary: CsvPreviewSummary;
      /** All slugs the import would create, for the confirm step. */
      slugs: string[];
    }
  | { ok: false; error: string; details?: Array<{ row?: number; column?: string; message: string }> };

export type CsvImportResult =
  | { ok: true; importedCount: number }
  | { ok: false; error: string; details?: Array<{ row?: number; column?: string; message: string }> };

/** File-size gate (spec §8) — checked before any parsing. */
export function isFileSizeWithinLimit(bytes: number): boolean {
  return bytes > 0 && bytes <= CSV_MAX_FILE_BYTES;
}

/**
 * Phase 1 of the flow: parse + validate + duplicate detection.
 * READ-ONLY against the database (one `findMany` for existing slugs);
 * performs zero writes (§15).
 */
export async function previewCsvImport(raw: string, storeId: string): Promise<CsvPreviewResult> {
  const parsed = parseCsv(raw);

  if (!parsed.ok) {
    return { ok: false, error: parsed.reason, details: parsed.errors };
  }

  const prisma = getPrisma();

  // Read-only duplicate probe against the selected store (§15 allows reads).
  const existing = await prisma.perfume.findMany({
    where: { storeId, slug: { not: null } },
    select: { slug: true },
  });
  const existingSlugs = new Set(existing.map((entry) => entry.slug));

  const rows: CsvPreviewRow[] = [];
  const slugsInFile = new Map<string, number>();
  const errors: CsvRowError[] = [];

  for (const { row, record } of parsed.value.rows) {
    const slug = (record["slug"] ?? "").trim();
    const name = (record["name"] ?? "").trim();
    const brand = (record["brand"] ?? "").trim();
    const gender = (record["gender"] ?? "").trim();

    const rowErrors = validateCsvRow(row, record);
    let status: CsvPreviewRow["status"] = rowErrors.length === 0 ? "valid" : "invalid";

    // In-file duplicate slug (same slug twice in one CSV).
    if (slug !== "" && slugsInFile.has(slug)) {
      status = "duplicate";
      rowErrors.push({
        row,
        column: "slug",
        message: `این slug در ردیف ${slugsInFile.get(slug)} همین فایل تکراری است.`,
      });
    } else if (slug !== "") {
      slugsInFile.set(slug, row);
    }

    // Duplicate against the selected store's existing inventory.
    if (status === "valid" && slug !== "" && existingSlugs.has(slug)) {
      status = "duplicate";
      rowErrors.push({
        row,
        column: "slug",
        message: "این slug قبلاً در فروشگاه وجود دارد.",
      });
    }

    for (const error of rowErrors) {
      errors.push(error);
    }

    rows.push({ row, name, brand, slug, gender, status, errors: rowErrors });
  }

  const validRows = rows.filter((entry) => entry.status === "valid").length;

  return {
    ok: true,
    raw,
    rows,
    summary: {
      totalRows: rows.length,
      validRows,
      errorRows: rows.length - validRows,
    },
    slugs: [...slugsInFile.keys()],
  };
}

/**
 * Phase 2 of the flow: the confirmed import.
 *
 * Re-validates the RAW CSV server-side (never trusting a client-asserted
 * "validated" flag, §16), re-checks duplicate slugs against the live DB to
 * close the preview→confirm race (§17), then imports every row in a single
 * transaction — 500 valid rows means 500 created or 0, never 300/200 (§11).
 */
export async function confirmCsvImport(raw: string, storeId: string): Promise<CsvImportResult> {
  // The store must exist and be active at commit time.
  const prisma = getPrisma();
  const store = await prisma.store.findFirst({
    where: { id: storeId, active: true },
    select: { id: true },
  });

  if (!store) {
    return { ok: false, error: "فروشگاه انتخاب‌شده فعال نیست." };
  }

  // Full server-side re-validation of the raw payload (§16/§17).
  const preview = await previewCsvImport(raw, storeId);

  if (!preview.ok) {
    return { ok: false, error: preview.error, details: preview.details };
  }

  if (preview.summary.errorRows > 0) {
    return {
      ok: false,
      error: "به دلیل وجود خطا، امکان وارد کردن فایل وجود ندارد.",
      details: preview.rows
        .filter((entry) => entry.status !== "valid")
        .flatMap((entry) => entry.errors.map((error) => ({ row: entry.row, column: error.column, message: error.message }))),
    };
  }

  if (preview.rows.length === 0) {
    return { ok: false, error: "فایل CSV هیچ ردیف داده‌ای ندارد." };
  }

  // Race-window re-check: slugs may have appeared between preview and confirm.
  const existing = await prisma.perfume.findMany({
    where: { storeId, slug: { in: preview.slugs } },
    select: { slug: true },
  });

  if (existing.length > 0) {
    return {
      ok: false,
      error: "به دلیل وجود خطا، امکان وارد کردن فایل وجود ندارد.",
      details: existing.map((entry) => ({
        column: "slug",
        message: `این slug در حین بررسی قبلاً در فروشگاه ثبت شده است: «${entry.slug ?? ""}».`,
      })),
    };
  }

  // Convert every row through the same validator used in preview, then write.
  const parsed = parseCsv(raw);

  if (!parsed.ok) {
    return { ok: false, error: parsed.reason, details: parsed.errors };
  }

  const inputs: AdminPerfumeInput[] = [];

  for (const { row, record } of parsed.value.rows) {
    const errors = validateCsvRow(row, record);

    if (errors.length > 0) {
      // Defensive: preview passed but re-validation failed — abort, no writes.
      return {
        ok: false,
        error: "به دلیل وجود خطا، امکان وارد کردن فایل وجود ندارد.",
        details: errors,
      };
    }

    const converted = buildAdminInput(record);

    if (!converted.ok) {
      return { ok: false, error: "به دلیل وجود خطا، امکان وارد کردن فایل وجود ندارد.", details: converted.errors };
    }

    inputs.push(converted.value);
  }

  try {
    const importedCount = await prisma.$transaction(async (tx) => {
      let count = 0;

      for (const input of inputs) {
        await tx.perfume.create({
          data: {
            storeId,
            name: input.name,
            brand: input.brand,
            slug: input.slug,
            description: input.description,
            productUrl: input.productUrl,
            imageUrl: input.imageUrl,
            gender: input.gender,
            price: input.price,
            inStock: input.inStock,
            active: input.active,
            // Exactly one profile per perfume (§13) — created inline so the
            // 1:1 relationship holds inside the same transaction.
            profile: {
              create: {
                social: input.profile.matching.social,
                adventurous: input.profile.matching.adventurous,
                expressive: input.profile.matching.expressive,
                mysterious: input.profile.matching.mysterious,
                fresh: input.profile.matching.fresh,
                warm: input.profile.matching.warm,
                experimental: input.profile.matching.experimental,
                elegant: input.profile.matching.elegant,
                bold: input.profile.matching.bold,
                sweet: input.profile.descriptors.sweet ?? 0,
                woody: input.profile.descriptors.woody ?? 0,
                spicy: input.profile.descriptors.spicy ?? 0,
                floral: input.profile.descriptors.floral ?? 0,
                citrus: input.profile.descriptors.citrus ?? 0,
                aquatic: input.profile.descriptors.aquatic ?? 0,
                smoky: input.profile.descriptors.smoky ?? 0,
                clean: input.profile.descriptors.clean ?? 0,
                longevity: input.profile.descriptors.longevity ?? 0,
                projection: input.profile.descriptors.projection ?? 0,
                notes: input.profile.notes,
                ...(input.profile.family !== undefined ? { family: input.profile.family } : {}),
                ...(input.profile.season !== undefined ? { season: input.profile.season } : {}),
                ...(input.profile.occasion !== undefined ? { occasion: input.profile.occasion } : {}),
              },
            },
          },
          select: { id: true },
        });

        count += 1;
      }

      return count;
    });

    return { ok: true, importedCount };
  } catch {
    // The interactive transaction rolled back — nothing was persisted.
    return { ok: false, error: "خطا در ثبت داده‌ها؛ هیچ ردیفی وارد نشد. لطفاً دوباره تلاش کنید." };
  }
}

/**
 * Converts an already row-validated CSV record into the typed Phase 6A input,
 * reusing `csvRecordToPayload`'s mapping so there is exactly one conversion.
 */
function buildAdminInput(
  record: Record<string, string>,
): { ok: true; value: AdminPerfumeInput } | { ok: false; errors: Array<{ column?: string; message: string }> } {
  const converted = csvRecordToPayload(0, record);

  if (!converted.ok) {
    return { ok: false, errors: converted.errors };
  }

  const validated = validatePerfumePayload(converted.payload);

  if (!validated.ok) {
    return {
      ok: false,
      errors: Object.entries(validated.errors).map(([column, message]) => ({ column, message })),
    };
  }

  return { ok: true, value: validated.value };
}
