import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPerfumeForStore, getPerfumesForStore } from "@/lib/admin/repository";
import type { ProfileProvenance } from "@/lib/fragrance/profile-enrichment";

/**
 * Repository layer for provenance visibility.
 *
 * The audit found `AdminPerfumeRow.profile` stopped at `family`/`notes`, so
 * `profileSource` was never fetched and the admin UI had nothing to show. These
 * tests pin the read path: the Prisma `select` must request `profileSource`, the
 * stored value must reach the caller untouched, and an absent profile must stay
 * `null` rather than being invented.
 *
 * Only the read functions are exercised — no AI provider, no network.
 */

const mocks = vi.hoisted(() => ({
  perfumeFindMany: vi.fn(),
  perfumeFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    perfume: {
      findMany: mocks.perfumeFindMany,
      findFirst: mocks.perfumeFindFirst,
    },
  }),
}));

/** A minimal row; only `storeId` and `profile` matter to these assertions. */
function makeRow(
  profileSource: ProfileProvenance | null,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "perfume-1",
    storeId: "store-1",
    name: "عطر تست",
    brand: "برند",
    slug: "test",
    description: null,
    productUrl: null,
    imageUrl: null,
    gender: "UNISEX",
    price: 100,
    inStock: true,
    active: true,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    profile:
      profileSource === null
        ? null
        : { family: "woody", notes: [], profileSource },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPerfumesForStore — provenance selection", () => {
  it("requests profileSource from Prisma so the UI can display provenance", async () => {
    mocks.perfumeFindMany.mockResolvedValue([]);

    await getPerfumesForStore("store-1");

    const arg = mocks.perfumeFindMany.mock.calls[0][0];
    expect(arg.select.profile.select).toHaveProperty("profileSource", true);
  });

  it("keeps the selection store-scoped and otherwise unchanged", async () => {
    mocks.perfumeFindMany.mockResolvedValue([]);

    await getPerfumesForStore("store-1");

    const arg = mocks.perfumeFindMany.mock.calls[0][0];
    expect(arg.where).toEqual({ storeId: "store-1" });
    expect(arg.select.profile.select.family).toBe(true);
    expect(arg.select.profile.select.notes).toBe(true);
  });

  it.each(["REFERENCE", "AI", "MANUAL"] as const)(
    "passes a stored %s provenance through to the caller unchanged",
    async (source) => {
      mocks.perfumeFindMany.mockResolvedValue([makeRow(source)]);

      const rows = await getPerfumesForStore("store-1");

      expect(rows[0].profile?.profileSource).toBe(source);
    },
  );

  it("reports a perfume without a profile as a null profile", async () => {
    mocks.perfumeFindMany.mockResolvedValue([makeRow(null)]);

    const rows = await getPerfumesForStore("store-1");

    expect(rows[0].profile).toBeNull();
  });
});

describe("getPerfumeForStore — provenance on the edit page", () => {
  it("requests profileSource from Prisma", async () => {
    mocks.perfumeFindFirst.mockResolvedValue(makeRow("REFERENCE"));

    await getPerfumeForStore("perfume-1", "store-1");

    const arg = mocks.perfumeFindFirst.mock.calls[0][0];
    expect(arg.select.profile.select).toHaveProperty("profileSource", true);
  });

  it.each(["REFERENCE", "AI", "MANUAL"] as const)(
    "returns the stored %s provenance verbatim",
    async (source) => {
      mocks.perfumeFindFirst.mockResolvedValue(makeRow(source));

      const perfume = await getPerfumeForStore("perfume-1", "store-1");

      expect(perfume?.profile?.profileSource).toBe(source);
    },
  );

  it("does not relabel provenance on read — AI stays AI, not MANUAL", async () => {
    mocks.perfumeFindFirst.mockResolvedValue(makeRow("AI"));

    const perfume = await getPerfumeForStore("perfume-1", "store-1");

    expect(perfume?.profile?.profileSource).not.toBe("MANUAL");
  });

  it("still refuses a cross-store id before provenance is surfaced", async () => {
    mocks.perfumeFindFirst.mockResolvedValue(makeRow("AI", { storeId: "other-store" }));

    const perfume = await getPerfumeForStore("perfume-1", "store-1");

    expect(perfume).toBeNull();
  });
});
