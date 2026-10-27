import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Provenance boundary for the ADMIN CSV upload path.
 *
 * `confirmCsvImport` accepts an optional `profileSource` for trusted
 * server-side callers importing machine-proposed datasets. That option must
 * not be reachable from the admin form: the upload action calls the service
 * with `(raw, storeId)` only, so every admin import keeps the MANUAL default
 * and no form field can smuggle a different provenance through.
 */

const mocks = vi.hoisted(() => ({
  confirmCsvImport: vi.fn(),
  previewCsvImport: vi.fn(),
}));

vi.mock("@/lib/admin/server-access", () => ({
  requireAdminAction: vi.fn(async () => {}),
}));

vi.mock("@/lib/admin/csv/service", () => ({
  confirmCsvImport: mocks.confirmCsvImport,
  previewCsvImport: mocks.previewCsvImport,
}));

import { confirmCsvAction } from "@/app/admin/perfumes/import/actions";

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirmCsvImport.mockResolvedValue({ ok: true, importedCount: 1 });
});

describe("admin CSV confirm action — no AI provenance exposure", () => {
  it("calls the service with (raw, storeId) only — the MANUAL default applies", async () => {
    const result = await confirmCsvAction(
      form({ storeId: "store-demo-perfume-shop", raw: "name,brand\n" }),
    );

    expect(result).toEqual({ ok: true, importedCount: 1 });
    expect(mocks.confirmCsvImport).toHaveBeenCalledTimes(1);
    // No third argument (no options object) → service stamps MANUAL.
    expect(mocks.confirmCsvImport.mock.calls[0]).toHaveLength(2);
  });

  it("ignores a profileSource field posted through the form", async () => {
    await confirmCsvAction(
      form({
        storeId: "store-demo-perfume-shop",
        raw: "name,brand\n",
        profileSource: "AI",
      }),
    );

    expect(mocks.confirmCsvImport.mock.calls[0]).toHaveLength(2);
    expect(mocks.confirmCsvImport.mock.calls[0]).not.toContainEqual(
      expect.objectContaining({ profileSource: "AI" }),
    );
  });
});
