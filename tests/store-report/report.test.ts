import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  generateReportToken,
  getStoreByReportToken,
  regenerateStoreReportToken,
} from "@/lib/store-report/report";

/**
 * Store report capability tests with a fully mocked Prisma — no live DB.
 * Focus: token strength (unguessable, URL-safe), no store enumeration
 * (unknown and inactive tokens resolve identically to null), safe field
 * selection (never the token itself, never PII), and rotation semantics
 * (old link dies, unknown store fails closed).
 */

const mocks = vi.hoisted(() => ({
  storeFindFirst: vi.fn(),
  storeUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    store: {
      findFirst: mocks.storeFindFirst,
      update: mocks.storeUpdate,
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateReportToken — unguessable capability", () => {
  it("emits at least 32 URL-safe characters", () => {
    const token = generateReportToken();

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("emits a fresh random token on every call", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateReportToken()));

    expect(seen.size).toBe(200);
  });
});

describe("getStoreByReportToken — no enumeration, safe fields", () => {
  it("resolves an active store by its token", async () => {
    mocks.storeFindFirst.mockResolvedValue({
      id: "store-1",
      name: "فروشگاه نمونه",
      logoUrl: null,
    });

    const store = await getStoreByReportToken("valid-token");

    expect(store).toEqual({ id: "store-1", name: "فروشگاه نمونه", logoUrl: null });
    expect(mocks.storeFindFirst).toHaveBeenCalledWith({
      where: { reportToken: "valid-token", active: true },
      select: { id: true, name: true, logoUrl: true },
    });
  });

  it("returns null for an unknown token (no enumeration signal)", async () => {
    mocks.storeFindFirst.mockResolvedValue(null);

    await expect(getStoreByReportToken("no-such-token")).resolves.toBeNull();
  });

  it("returns null for an empty token without touching the DB", async () => {
    await expect(getStoreByReportToken("")).resolves.toBeNull();

    expect(mocks.storeFindFirst).not.toHaveBeenCalled();
  });

  it("never selects the token itself or any PII field", async () => {
    mocks.storeFindFirst.mockResolvedValue({ id: "store-1", name: "x", logoUrl: null });

    await getStoreByReportToken("valid-token");

    const select = mocks.storeFindFirst.mock.calls[0][0].select;

    expect(Object.keys(select).sort()).toEqual(["id", "logoUrl", "name"]);
  });
});

describe("regenerateStoreReportToken — rotation kills the old link", () => {
  it("writes a fresh valid token for a known store", async () => {
    mocks.storeFindFirst.mockResolvedValue({ id: "store-1" });
    mocks.storeUpdate.mockResolvedValue({ id: "store-1" });

    const result = await regenerateStoreReportToken("store-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reportToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
      expect(mocks.storeUpdate).toHaveBeenCalledWith({
        where: { id: "store-1" },
        data: { reportToken: result.reportToken },
      });
    }
  });

  it("fails closed for an unknown store without writing", async () => {
    mocks.storeFindFirst.mockResolvedValue(null);

    const result = await regenerateStoreReportToken("store-x");

    expect(result).toEqual({ ok: false, reason: "STORE_NOT_FOUND" });
    expect(mocks.storeUpdate).not.toHaveBeenCalled();
  });
});
