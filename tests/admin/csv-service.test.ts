import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmCsvImport, previewCsvImport } from "@/lib/admin/csv/service";

/**
 * Phase 6B service tests (spec §24, duplicate + import sections) with a fully
 * mocked Prisma client — no live database. Focus:
 *  - preview never mutates (only findMany is called);
 *  - duplicate slug inside the file / inside the store blocks the import;
 *  - the same slug in a DIFFERENT store is fine (store isolation);
 *  - the confirmed import is atomic: one $transaction, all rows or none.
 */

const mocks = vi.hoisted(() => {
  return {
    findManyPerfume: vi.fn(),
    findFirstStore: vi.fn(),
    transaction: vi.fn(),
    perfumeCreate: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    perfume: { findMany: mocks.findManyPerfume, create: mocks.perfumeCreate },
    store: { findFirst: mocks.findFirstStore },
    $transaction: mocks.transaction,
  }),
}));

const HEADER =
  "name,brand,slug,gender,price,social,adventurous,expressive,mysterious,fresh,warm,experimental,elegant,bold";

const ROW = "عطر شب,Brand,night-perfume,MEN,1500000,60,40,55,70,30,65,45,80,50";

function makeCsv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findManyPerfume.mockResolvedValue([]);
  mocks.findFirstStore.mockResolvedValue({ id: "store-1" });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<number>) => {
    const tx = { perfume: { create: mocks.perfumeCreate } };

    mocks.perfumeCreate.mockResolvedValue({ id: "created" });
    return fn(tx);
  });
});

describe("previewCsvImport — read-only guarantee (§15)", () => {
  it("calls only findMany (a read) and never create/update/delete", async () => {
    const result = await previewCsvImport(makeCsv(ROW), "store-1");

    expect(result.ok).toBe(true);
    expect(mocks.findManyPerfume).toHaveBeenCalledTimes(1);
    expect(mocks.perfumeCreate).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("summarises totals for a clean file", async () => {
    const result = await previewCsvImport(makeCsv(ROW, ROW.replace("night-perfume", "day-perfume")), "store-1");

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.summary).toEqual({ totalRows: 2, validRows: 2, errorRows: 0 });
    }
  });
});

describe("duplicate detection (§10)", () => {
  it("flags a slug repeated inside the CSV", async () => {
    const result = await previewCsvImport(makeCsv(ROW, ROW), "store-1");

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.summary.validRows).toBe(1);
      expect(result.summary.errorRows).toBe(1);
      expect(result.rows[1].status).toBe("duplicate");
      expect(result.rows[1].errors[0].message).toContain("تکراری");
    }
  });

  it("flags a slug that already exists in the selected store", async () => {
    mocks.findManyPerfume.mockResolvedValue([{ slug: "night-perfume" }]);
    const result = await previewCsvImport(makeCsv(ROW), "store-1");

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.summary.errorRows).toBe(1);
      expect(result.rows[0].status).toBe("duplicate");
      expect(result.rows[0].errors[0].message).toContain("قبلاً در فروشگاه");
    }
  });

  it("does not flag a slug unique to another store (isolation)", async () => {
    // The duplicate probe is scoped to storeId — a foreign store's slug list
    // never reaches this store's comparison set.
    mocks.findManyPerfume.mockResolvedValue([{ slug: "night-perfume" }]);

    const csv = makeCsv(ROW.replace("night-perfume", "other-slug"));
    await previewCsvImport(csv, "store-2");
    const call = mocks.findManyPerfume.mock.calls[0][0];

    expect(call.where.storeId).toBe("store-2");
  });
});

describe("confirmCsvImport — atomicity and re-validation (§11/§16/§17)", () => {
  it("imports all rows in ONE transaction with the selected storeId", async () => {
    const csv = makeCsv(ROW, ROW.replace("night-perfume", "day-perfume"));
    const result = await confirmCsvImport(csv, "store-1");

    expect(result).toEqual({ ok: true, importedCount: 2 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.perfumeCreate).toHaveBeenCalledTimes(2);

    const data = mocks.perfumeCreate.mock.calls[0][0].data;

    expect(data.storeId).toBe("store-1");
    expect(data.slug).toBe("night-perfume");
    expect(data.profile.create.social).toBe(60);
    expect(data.profile.create.sweet).toBe(0);
  });

  it("stamps imported profiles MANUAL — CSV is manual-authoritative (deliberate Option B)", async () => {
    const csv = makeCsv(ROW);
    const result = await confirmCsvImport(csv, "store-1");

    expect(result.ok).toBe(true);

    const profile = mocks.perfumeCreate.mock.calls[0][0].data.profile.create;
    // The nine matching axes are REQUIRED CSV columns (lib/admin/csv/contract.ts),
    // so every row is the merchant's authored data, submitted intentionally.
    // Automatic reference/AI enrichment is deliberately NOT triggered: no AI
    // call may run inside the import transaction, and the provenance must
    // reflect the true source (MANUAL). Merchants who want enrichment for
    // imported rows run the dedicated bulk profiling workflow afterwards.
    expect(profile.profileSource).toBe("MANUAL");
    expect(profile.social).toBe(60); // authored CSV value, untouched
  });

  it("creates exactly one profile per perfume (§13)", async () => {
    const csv = makeCsv(ROW);
    await confirmCsvImport(csv, "store-1");

    const data = mocks.perfumeCreate.mock.calls[0][0].data;

    expect(data.profile).toBeDefined();
    // One nested profile create — never a second profile row.
    expect(Object.keys(data.profile)).toEqual(["create"]);
  });

  it("refuses the import when the store is missing or inactive", async () => {
    mocks.findFirstStore.mockResolvedValue(null);
    const result = await confirmCsvImport(makeCsv(ROW), "store-x");

    expect(result.ok).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.perfumeCreate).not.toHaveBeenCalled();
  });

  it("refuses the import when any row is invalid — nothing is written", async () => {
    const csv = makeCsv(ROW, ROW.replace(",65,", ",165,"));
    const result = await confirmCsvImport(csv, "store-1");

    expect(result.ok).toBe(false);
    expect(mocks.perfumeCreate).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("re-checks slugs at commit time and aborts on a race (§17)", async () => {
    mocks.findManyPerfume
      .mockResolvedValueOnce([]) // preview probe: clean
      .mockResolvedValueOnce([{ slug: "night-perfume" }]); // commit re-check: taken

    const result = await confirmCsvImport(makeCsv(ROW), "store-1");

    expect(result.ok).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.perfumeCreate).not.toHaveBeenCalled();
  });

  it("reports failure and no partial success when the transaction throws", async () => {
    mocks.transaction.mockRejectedValue(new Error("P2002"));
    const result = await confirmCsvImport(makeCsv(ROW, ROW.replace("night-perfume", "day-perfume")), "store-1");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toContain("هیچ ردیفی وارد نشد");
    }
  });
});
