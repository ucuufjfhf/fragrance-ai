import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Page-level proof that provenance is actually VISIBLE to a merchant.
 *
 * The badge unit test proves `ProfileSourceBadge` renders each provenance; the
 * repository test proves `profileSource` is fetched. Neither proves the wiring.
 * This renders the real `/admin/perfumes` server component (project convention:
 * SSR via `react-dom/server`, no jsdom) with only the framework/DB seams
 * mocked, so it would fail if the badge were dropped from the list row.
 *
 * `headers()` and `requireAdmin` are stubbed — no network, no session, no DB.
 */

const mocks = vi.hoisted(() => ({
  getPerfumesForStore: vi.fn(),
  getActiveStores: vi.fn(),
  requireAdmin: vi.fn(async () => true),
  getOpenBulkJobForStoreAction: vi.fn(async () => null),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

vi.mock("@/lib/admin/server-access", () => ({ requireAdmin: mocks.requireAdmin }));

vi.mock("@/lib/admin/repository", () => ({
  getPerfumesForStore: mocks.getPerfumesForStore,
  getActiveStores: mocks.getActiveStores,
}));

vi.mock("@/app/admin/perfumes/bulk-actions", () => ({
  getOpenBulkJobForStoreAction: mocks.getOpenBulkJobForStoreAction,
}));

vi.mock("@/app/admin/access/actions", () => ({
  logoutAdminAccessAction: vi.fn(),
}));

// The client sub-components are irrelevant here and pull in server actions;
// stub them so the render exercises the page's own markup only.
vi.mock("@/components/admin/BulkProfilingPanel", () => ({
  default: () => null,
}));
vi.mock("@/components/admin/PerfumeToggles", () => ({ default: () => null }));
vi.mock("@/components/admin/WidgetEmbedCode", () => ({ default: () => null }));

const AdminPerfumesPage = (await import("@/app/admin/perfumes/page")).default;

function makePerfume(
  name: string,
  profileSource: "REFERENCE" | "AI" | "MANUAL" | null,
): Record<string, unknown> {
  return {
    id: `p-${name}`,
    storeId: "store-1",
    name,
    brand: "برند",
    slug: name,
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
        : {
            social: 50,
            adventurous: 50,
            expressive: 50,
            mysterious: 50,
            fresh: 50,
            warm: 50,
            experimental: 50,
            elegant: 50,
            bold: 50,
            sweet: null,
            woody: null,
            spicy: null,
            floral: null,
            citrus: null,
            aquatic: null,
            smoky: null,
            clean: null,
            longevity: null,
            projection: null,
            family: "woody",
            notes: [],
            season: null,
            occasion: null,
            profileSource,
          },
  };
}

async function renderList(
  rows: Record<string, unknown>[],
): Promise<string> {
  mocks.getPerfumesForStore.mockResolvedValue(rows);

  const element = await AdminPerfumesPage({
    searchParams: Promise.resolve({ store: "store-1" }),
  });

  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActiveStores.mockResolvedValue([{ id: "store-1", name: "فروشگاه", slug: "s" }]);
  mocks.requireAdmin.mockResolvedValue(true);
  mocks.getOpenBulkJobForStoreAction.mockResolvedValue(null);
});

describe("/admin/perfumes — provenance is visible in the list", () => {
  it("renders one provenance badge per perfume, with the stored value", async () => {
    const html = await renderList([
      makePerfume("A", "REFERENCE"),
      makePerfume("B", "AI"),
      makePerfume("C", "MANUAL"),
    ]);

    expect(html).toContain('data-profile-source="REFERENCE"');
    expect(html).toContain('data-profile-source="AI"');
    expect(html).toContain('data-profile-source="MANUAL"');

    // The Persian labels reach the merchant, not raw enum names.
    expect(html).toContain("مرجع");
    expect(html).toContain("هوش مصنوعی");
    expect(html).toContain("دستی");
  });

  it("marks a perfume with no profile as «بدون پروفایل»", async () => {
    const html = await renderList([makePerfume("D", null)]);

    expect(html).toContain('data-profile-source="NONE"');
    expect(html).toContain("بدون پروفایل");
  });

  it("does not expose provenance as an editable control on the list", async () => {
    const html = await renderList([makePerfume("E", "AI")]);

    expect(html).not.toContain('name="profileSource"');
    expect(html).not.toContain('value="AI"');
  });
});
