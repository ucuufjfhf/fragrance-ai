import {
  CSV_ALL_COLUMNS,
  CSV_MAX_DATA_ROWS,
  CSV_MATCHING_COLUMNS,
  CSV_REQUIRED_PRODUCT_COLUMNS,
} from "@/lib/admin/csv/contract";

/**
 * A pure, dependency-free RFC-4180 CSV parser (Phase 6B).
 *
 * `split(",")` cannot handle quoted fields or commas inside descriptions, so
 * this is a real character-level state machine supporting:
 *  - quoted fields with `""` escapes (`"a,b"` → one field `a,b`);
 *  - CRLF, LF and CR line endings;
 *  - a UTF-8 BOM prefix (Windows-exported files) — stripped silently;
 *  - Persian text (pure string handling, no decoding assumptions).
 *
 * Pure and testable without a DB; the service layer owns file-size limits.
 */

export interface ParsedCsv {
  /** Data records (header excluded), each with its 1-based data row number. */
  rows: Array<{ row: number; record: Record<string, string> }>;
}

export type CsvParseResult =
  | { ok: true; value: ParsedCsv }
  | { ok: false; reason: string; errors: Array<{ row?: number; column?: string; message: string }> };

/**
 * Splits raw CSV text into rows of fields per RFC-4180.
 * Throws `CsvSyntaxError` on an unterminated quoted field.
 */
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let fieldWasQuoted = false;

  const pushField = () => {
    record.push(fieldWasQuoted ? field : field.trim());
    field = "";
    fieldWasQuoted = false;
  };

  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field !== "") {
        throw new CsvSyntaxError("quote داخل فیلد بدون احاطهٔ گیومه.");
      }
      inQuotes = true;
      fieldWasQuoted = true;
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }

    if (char === "\r" || char === "\n") {
      // A quoted field may contain newlines; unquoted newlines end the record.
      pushRecord();
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }

    field += char;
  }

  // A quote opened but never closed — malformed CSV, reject outright.
  if (inQuotes) {
    throw new CsvSyntaxError("فیلد گیومه‌دار بسته نشده است.");
  }

  // The final record (no trailing newline) — only when it holds data.
  if (field !== "" || record.length > 0 || fieldWasQuoted) {
    pushRecord();
  }

  return records;
}

export class CsvSyntaxError extends Error {}

/**
 * Parses CSV text: strips the BOM, splits records, validates the header
 * (required / unknown / duplicate columns) and returns typed data rows.
 *
 * Rejects (never partially parses): empty input, malformed quotes, missing
 * required columns, unknown columns, duplicate columns, empty data rows and
 * files exceeding the row limit.
 */
export function parseCsv(text: string): CsvParseResult {
  // Strip a UTF-8 BOM (EF BB BF shows up as \uFEFF after decoding).
  const cleaned = text.startsWith("\uFEFF") ? text.slice(1) : text;

  if (cleaned.trim() === "") {
    return { ok: false, reason: "فایل CSV خالی است.", errors: [] };
  }

  let records: string[][];

  try {
    records = parseRecords(cleaned);
  } catch (error) {
    return {
      ok: false,
      reason: "فایل CSV نامعتبر است (ساختار گیومه‌ها نادرست است).",
      errors: [
        {
          message:
            error instanceof CsvSyntaxError
              ? error.message
              : "فایل CSV نامعتبر است.",
        },
      ],
    };
  }

  const [headerRow, ...dataRows] = records;
  const header = headerRow ?? [];
  const seen = new Set<string>();
  const errors: Array<{ row?: number; column?: string; message: string }> = [];

  for (const column of header) {
    const name = column.trim();

    if (seen.has(name)) {
      errors.push({ column: name, message: `ستون تکراری: «${name}».` });
      continue;
    }

    seen.add(name);
  }

  for (const required of [...CSV_REQUIRED_PRODUCT_COLUMNS, ...CSV_MATCHING_COLUMNS]) {
    if (!seen.has(required)) {
      errors.push({ column: required, message: `ستون اجباری وجود ندارد: «${required}».` });
    }
  }

  for (const column of header) {
    const name = column.trim();

    if (name !== "" && !CSV_ALL_COLUMNS.includes(name)) {
      errors.push({ column: name, message: `ستون ناشناس: «${name}» (ستون storeId مجاز نیست).` });
    }
  }

  if (errors.length > 0) {
    return { ok: false, reason: "ساختار فایل CSV نامعتبر است.", errors };
  }

  if (dataRows.length > CSV_MAX_DATA_ROWS) {
    return {
      ok: false,
      reason: `تعداد ردیف‌ها بیشتر از حد مجاز است (${CSV_MAX_DATA_ROWS} ردیف).`,
      errors: [],
    };
  }

  const rows: ParsedCsv["rows"] = [];

  for (const [index, record] of dataRows.entries()) {
    const row = index + 1;

    // A completely empty trailing line is tolerated; a short/long record is not.
    if (record.length === 1 && record[0].trim() === "") {
      continue;
    }

    if (record.length !== header.length) {
      errors.push({
        row,
        message: `تعداد ستون‌ها با سربرگ هم‌خوانی ندارد (انتظار ${header.length}، دریافتی ${record.length}).`,
      });
      continue;
    }

    const entry: Record<string, string> = {};

    header.forEach((column, columnIndex) => {
      entry[column.trim()] = record[columnIndex] ?? "";
    });

    rows.push({ row, record: entry });
  }

  return { ok: true, value: { rows } };
}
