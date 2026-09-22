import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/admin/csv/parser";
import { CSV_MAX_DATA_ROWS } from "@/lib/admin/csv/contract";

/**
 * Pure tests for the Phase 6B RFC-4180 parser (spec §24, parser section).
 * No database, no network — raw text in, structured result out.
 */

/** A minimal valid CSV: required columns + the nine matching axes. */
const VALID_HEADER =
  "name,brand,slug,gender,price,social,adventurous,expressive,mysterious,fresh,warm,experimental,elegant,bold";

const VALID_ROW = "عطر شب,Brand,night-perfume,MEN,1500000,60,40,55,70,30,65,45,80,50";

function makeCsv(...rows: string[]): string {
  return [VALID_HEADER, ...rows].join("\n");
}

describe("parseCsv — valid input", () => {
  it("parses a simple valid CSV with Persian text", () => {
    const result = parseCsv(makeCsv(VALID_ROW));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.rows).toHaveLength(1);
      expect(result.value.rows[0].row).toBe(1);
      expect(result.value.rows[0].record["name"]).toBe("عطر شب");
      expect(result.value.rows[0].record["bold"]).toBe("50");
    }
  });

  it("parses multiple rows with correct 1-based row numbers", () => {
    const result = parseCsv(makeCsv(VALID_ROW, VALID_ROW));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.rows.map((entry) => entry.row)).toEqual([1, 2]);
    }
  });

  it("parses quoted fields with commas inside the value", () => {
    const csv = makeCsv('"عطر، با کاما",Brand,quoted,MEN,100,50,50,50,50,50,50,50,50,50');

    expect(result_ok(csv)).toBe(true);

    const result = parseCsv(csv);

    if (result.ok) {
      expect(result.value.rows[0].record["name"]).toBe("عطر، با کاما");
    }
  });

  it("parses escaped double quotes inside quoted fields", () => {
    const csv = makeCsv('"The ""Noir"" Edition",Brand,quoted-quotes,MEN,100,50,50,50,50,50,50,50,50,50');
    const result = parseCsv(csv);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.rows[0].record["name"]).toBe('The "Noir" Edition');
    }
  });

  it("handles CRLF line endings", () => {
    const csv = [VALID_HEADER, VALID_ROW].join("\r\n");
    const result = parseCsv(csv);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.rows).toHaveLength(1);
    }
  });

  it("strips a UTF-8 BOM from the header", () => {
    const csv = `\uFEFF${makeCsv(VALID_ROW)}`;
    const result = parseCsv(csv);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.rows[0].record["name"]).toBe("عطر شب");
    }
  });

  it("tolerates a trailing newline and blank trailing line", () => {
    const result = parseCsv(`${makeCsv(VALID_ROW)}\n\n`);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.rows).toHaveLength(1);
    }
  });
});

/** Small helper so `expect(result.ok)` reads cleanly in the tests above. */
function result_ok(text: string): boolean {
  const result = parseCsv(text);

  return result.ok;
}

describe("parseCsv — header validation (§7: never silently ignore bad headers)", () => {
  it("rejects missing required product columns", () => {
    const result = parseCsv("name,brand,social,adventurous,expressive,mysterious,fresh,warm,experimental,elegant,bold\na,b,1,2,3,4,5,6,7,8,9");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      const columns = result.errors.map((error) => error.column);

      expect(columns).toContain("slug");
      expect(columns).toContain("gender");
      expect(columns).toContain("price");
    }
  });

  it("rejects missing required matching-dimension columns", () => {
    const result = parseCsv("name,brand,slug,gender,price,social,adventurous\na,b,c,MEN,1,10,20");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      const columns = result.errors.map((error) => error.column);

      expect(columns).toContain("expressive");
      expect(columns).toContain("bold");
    }
  });

  it("rejects unknown columns (including storeId)", () => {
    const result = parseCsv(`${VALID_HEADER},storeId\n${VALID_ROW},store-1`);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.some((error) => error.column === "storeId")).toBe(true);
    }
  });

  it("rejects duplicate column names", () => {
    const result = parseCsv(`${VALID_HEADER},name\n${VALID_ROW},x`);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.some((error) => error.message.includes("تکراری"))).toBe(true);
    }
  });
});

describe("parseCsv — structure errors", () => {
  it("rejects empty input", () => {
    const result = parseCsv("");

    expect(result.ok).toBe(false);
  });

  it("rejects whitespace-only input", () => {
    const result = parseCsv("   \n  ");

    expect(result.ok).toBe(false);
  });

  it("rejects rows whose column count mismatches the header", () => {
    const result = parseCsv(makeCsv("only,three,cells"));

    expect(result.ok).toBe(true);

    if (result.ok) {
      // The mismatch is surfaced as a row error inside the ok-result…
      expect(result.value.rows).toHaveLength(0);
    }
  });

  it("rejects a file exceeding the row limit", () => {
    const rows = Array.from({ length: CSV_MAX_DATA_ROWS + 1 }, () => VALID_ROW);
    const result = parseCsv(makeCsv(...rows));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toContain("حد مجاز");
    }
  });

  it("accepts a file exactly at the row limit", () => {
    const rows = Array.from({ length: CSV_MAX_DATA_ROWS }, () => VALID_ROW);
    const result = parseCsv(makeCsv(...rows));

    expect(result.ok).toBe(true);
  });

  it("reports quoted-field syntax errors instead of throwing", () => {
    const result = parseCsv(makeCsv('"unterminated,Brand,x,MEN,1,1,1,1,1,1,1,1,1,1'));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toContain("نامعتبر");
    }
  });
});
