import { describe, expect, it } from "vitest";

import { csvRecordToPayload, parseCsvBoolean, parseNotes, validateCsvRow } from "@/lib/admin/csv/validate";

/**
 * Pure tests for Phase 6B row validation (spec §24, validation section).
 * No database: raw CSV records in, structured errors out.
 */

/** A complete, valid record for every canonical column. */
function makeRecord(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    name: "عطر شب",
    brand: "Brand",
    slug: "night-perfume",
    gender: "MEN",
    price: "1500000",
    description: "",
    productUrl: "",
    imageUrl: "",
    inStock: "",
    active: "",
    social: "60",
    adventurous: "40",
    expressive: "55",
    mysterious: "70",
    fresh: "30",
    warm: "65",
    experimental: "45",
    elegant: "80",
    bold: "50",
    sweet: "",
    woody: "",
    spicy: "",
    floral: "",
    citrus: "",
    aquatic: "",
    smoky: "",
    clean: "",
    longevity: "",
    projection: "",
    family: "",
    notes: "",
    season: "",
    occasion: "",
    ...overrides,
  };
}

describe("parseCsvBoolean — the explicit boolean contract (§6)", () => {
  it("accepts exactly true/false (case-insensitive)", () => {
    expect(parseCsvBoolean("true")).toBe(true);
    expect(parseCsvBoolean("TRUE")).toBe(true);
    expect(parseCsvBoolean("false")).toBe(false);
  });

  it("rejects arbitrary truthy strings instead of guessing", () => {
    expect(parseCsvBoolean("1")).toBeNull();
    expect(parseCsvBoolean("yes")).toBeNull();
    expect(parseCsvBoolean("بله")).toBeNull();
    expect(parseCsvBoolean("")).toBeNull();
  });
});

describe("parseNotes — the | separator (§3)", () => {
  it("splits a pipe-separated list", () => {
    expect(parseNotes("Bergamot|Lavender|Cedar|Musk")).toEqual(["Bergamot", "Lavender", "Cedar", "Musk"]);
  });

  it("trims items and drops empties", () => {
    expect(parseNotes(" Bergamot | | Cedar ")).toEqual(["Bergamot", "Cedar"]);
  });

  it("maps an empty value to an empty array", () => {
    expect(parseNotes("")).toEqual([]);
  });
});

describe("csvRecordToPayload — shape conversion", () => {
  it("converts a valid record", () => {
    const result = csvRecordToPayload(1, makeRecord());

    expect(result.ok).toBe(true);

    if (result.ok) {
      const payload = result.payload as Record<string, unknown>;

      expect(payload["name"]).toBe("عطر شب");
      expect(payload["inStock"]).toBe(true);
      expect(payload["active"]).toBe(true);
    }
  });

  it("defaults omitted optional descriptors to 0 (§13)", () => {
    const result = csvRecordToPayload(1, makeRecord());

    expect(result.ok).toBe(true);

    if (result.ok) {
      const payload = result.payload as { profile: Record<string, number> };

      expect(payload.profile["sweet"]).toBe(0);
      expect(payload.profile["projection"]).toBe(0);
    }
  });

  it("converts notes to a string array", () => {
    const result = csvRecordToPayload(1, makeRecord({ notes: "Bergamot|Lavender" }));

    expect(result.ok).toBe(true);

    if (result.ok) {
      const payload = result.payload as { profile: { notes: string[] } };

      expect(payload.profile.notes).toEqual(["Bergamot", "Lavender"]);
    }
  });

  it("rejects a storeId column (§12)", () => {
    const record = makeRecord();

    record["storeId"] = "store-1";
    const result = csvRecordToPayload(1, record);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.some((error) => error.column === "storeId")).toBe(true);
    }
  });

  it("rejects an empty required field with the row number", () => {
    const result = csvRecordToPayload(7, makeRecord({ brand: "" }));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({ row: 7, column: "brand" });
    }
  });

  it("rejects an empty required matching dimension", () => {
    const result = csvRecordToPayload(2, makeRecord({ fresh: "" }));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.some((error) => error.column === "fresh")).toBe(true);
    }
  });
});

describe("validateCsvRow — numeric rules (§5: reject, never clamp)", () => {
  it("accepts a fully valid row", () => {
    expect(validateCsvRow(1, makeRecord())).toEqual([]);
  });

  it("rejects a decimal matching value", () => {
    const errors = validateCsvRow(3, makeRecord({ fresh: "30.5" }));

    expect(errors.some((error) => error.column === "fresh" && error.row === 3)).toBe(true);
  });

  it("rejects a negative matching value", () => {
    const errors = validateCsvRow(1, makeRecord({ fresh: "-5" }));

    expect(errors.some((error) => error.column === "fresh")).toBe(true);
  });

  it("rejects a matching value above 100", () => {
    const errors = validateCsvRow(1, makeRecord({ bold: "101" }));

    expect(errors.some((error) => error.column === "bold")).toBe(true);
  });

  it("accepts the boundary values 0 and 100", () => {
    const errors = validateCsvRow(1, makeRecord({ fresh: "0", bold: "100" }));

    expect(errors).toEqual([]);
  });

  it("rejects NaN / non-numeric strings", () => {
    const errors = validateCsvRow(1, makeRecord({ warm: "گرم" }));

    expect(errors.some((error) => error.column === "warm")).toBe(true);
  });

  it("rejects a decimal optional descriptor", () => {
    const errors = validateCsvRow(1, makeRecord({ woody: "10.5" }));

    expect(errors.some((error) => error.column === "woody")).toBe(true);
  });

  it("rejects an out-of-range optional descriptor", () => {
    const errors = validateCsvRow(1, makeRecord({ woody: "150" }));

    expect(errors.some((error) => error.column === "woody")).toBe(true);
  });
});

describe("validateCsvRow — product rules via the Phase 6A validator", () => {
  it("rejects an invalid gender enum (§4: no silent translation)", () => {
    const errors = validateCsvRow(1, makeRecord({ gender: "مردانه" }));

    expect(errors.some((error) => error.column === "gender")).toBe(true);
  });

  it("accepts the exact schema enum values", () => {
    for (const gender of ["MEN", "WOMEN", "UNISEX"]) {
      expect(validateCsvRow(1, makeRecord({ gender }))).toEqual([]);
    }
  });

  it("rejects a negative price", () => {
    const errors = validateCsvRow(1, makeRecord({ price: "-100" }));

    expect(errors.some((error) => error.column === "price")).toBe(true);
  });

  it("rejects a non-numeric price", () => {
    const errors = validateCsvRow(1, makeRecord({ price: "گران" }));

    expect(errors.some((error) => error.column === "price")).toBe(true);
  });

  it("rejects an invalid productUrl", () => {
    const errors = validateCsvRow(1, makeRecord({ productUrl: "not-a-url" }));

    expect(errors.some((error) => error.column === "productUrl")).toBe(true);
  });

  it("accepts a valid https productUrl", () => {
    const errors = validateCsvRow(1, makeRecord({ productUrl: "https://example.com/perfume" }));

    expect(errors).toEqual([]);
  });

  it("rejects an invalid boolean", () => {
    const errors = validateCsvRow(1, makeRecord({ inStock: "maybe" }));

    expect(errors.some((error) => error.column === "inStock")).toBe(true);
  });

  it("rejects an invalid slug pattern", () => {
    const errors = validateCsvRow(1, makeRecord({ slug: "Invalid Slug!" }));

    expect(errors.some((error) => error.column === "slug")).toBe(true);
  });

  it("rejects an invalid season enum", () => {
    const errors = validateCsvRow(1, makeRecord({ season: "MONSOON" }));

    expect(errors.some((error) => error.column === "season")).toBe(true);
  });

  it("rejects a missing name", () => {
    const errors = validateCsvRow(1, makeRecord({ name: "" }));

    expect(errors.some((error) => error.column === "name")).toBe(true);
  });
});
