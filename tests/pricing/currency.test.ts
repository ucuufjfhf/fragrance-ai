import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CURRENCY_LABEL_FA, STORE_CURRENCY } from "@/lib/pricing/currency";

/**
 * The currency unit is an invariant, not a detail: `Perfume.price` holds the
 * amount a merchant typed in Toman, and the admin UI shows «تومان». These tests
 * pin the constant, so a stray edit to `"IRR"` (the ISO Rial code, which would
 * imply a ×10 conversion this codebase deliberately never performs) fails here
 * rather than silently mislabelling every stored price.
 */

const read = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("canonical currency constant", () => {
  it('is the literal "TOMAN"', () => {
    expect(STORE_CURRENCY).toBe("TOMAN");
  });

  it("is not an ISO Rial code or a non-canonical spelling", () => {
    expect(STORE_CURRENCY).not.toBe("IRR");
    expect(STORE_CURRENCY).not.toBe("IRT");
    expect(STORE_CURRENCY).not.toBe("Toman");
    expect(STORE_CURRENCY).not.toBe("toman");
  });

  it("keeps the Persian display label separate from the persisted value", () => {
    expect(CURRENCY_LABEL_FA).toBe("تومان");
    // The label is display-only; it must never be the stored identifier.
    expect(CURRENCY_LABEL_FA).not.toBe(STORE_CURRENCY);
  });
});

describe("schema and migrations agree with the constant", () => {
  it("defaults `Perfume.currency` to the canonical unit in the Prisma schema", () => {
    const schema = read("prisma/schema.prisma");

    expect(schema).toContain(`currency String @default("${STORE_CURRENCY}")`);
    expect(schema).not.toContain('currency String @default("IRR")');
  });

  it("adds the default change as its own additive migration", () => {
    const sql = read("prisma/migrations/20261007_toman_currency_default/migration.sql");

    expect(sql).toContain(`ALTER TABLE "Perfume" ALTER COLUMN "currency" SET DEFAULT '${STORE_CURRENCY}'`);
    // Additive only: no column recreation, no data rewrite.
    expect(sql).not.toContain("DROP COLUMN");
    expect(sql).not.toContain("UPDATE ");
  });

  it("leaves the already-applied init migration as an accurate historical record", () => {
    const sql = read("prisma/migrations/20250920_phase2_init_schema/migration.sql");

    // The original default is history and must NOT be edited retroactively.
    expect(sql).toContain(`"currency" TEXT NOT NULL DEFAULT 'IRR'`);
  });
});
