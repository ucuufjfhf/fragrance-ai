import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Page-level proof that provenance is informational on the EDIT page.
 *
 * The list page is covered by `perfumes-page-provenance.test.tsx`; this covers
 * the second surface the merchant reaches. Two requirements are pinned here:
 *
 *  1. §4 — provenance must not be an editable form field. The assertion is
 *     structural: the badge must appear BEFORE `<PerfumeForm>` opens its form,
 *     so it can never be part of the submitted FormData.
 *  2. §5 — the page must tell the merchant that editing values does NOT change
 *     the recorded source (a manually edited AI profile stays labelled AI).
 *
 * Server component rendered via react-dom/server (project convention); the
 * admin gate and the repository are the only mocked seams. No network, no DB.
 */

const mocks = vi.hoisted(() => ({
  getPerfumeForStore: vi.fn(),
  requireAdmin: vi.fn(async () => true),
}));

vi.mock("@/lib/admin/server-access", () => ({ requireAdmin: mocks.requireAdmin }));

vi.mock("@/lib/admin/repository", () => ({
  getPerfumeForStore: mocks.getPerfumeForStore,
}));

vi.mock("@/app/admin/perfumes/actions", () => ({
  updatePerfumeAction: vi.fn(),
}));

// Stubbed so the render stops at the form boundary; the test asserts on where
// the badge sits relative to it, not on the form's own fields.
vi.mock("@/components/admin/PerfumeForm", () => ({
  default: () => null,
}));

const EditPerfumePage = (await import("@/app/admin/perfumes/[id]/edit/page")).default;

function makePerfume(
  profileSource: "REFERENCE" | "AI" | "MANUAL" | null,
): Record<string, unknown> {
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

async function renderEdit(profileSource: "REFERENCE" | "AI" | "MANUAL" | null) {
  mocks.getPerfumeForStore.mockResolvedValue(makePerfume(profileSource));

  const element = await EditPerfumePage({
    params: Promise.resolve({ id: "perfume-1" }),
    searchParams: Promise.resolve({ store: "store-1" }),
  });

  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue(true);
});

describe("/admin/perfumes/[id]/edit — provenance is informational", () => {
  it.each(["REFERENCE", "AI", "MANUAL"] as const)(
    "shows the stored %s provenance to the merchant",
    async (source) => {
      const html = await renderEdit(source);

      expect(html).toContain(`data-profile-source="${source}"`);
    },
  );

  it("shows the missing-profile state when there is no profile", async () => {
    const html = await renderEdit(null);

    expect(html).toContain('data-profile-source="NONE"');
    expect(html).toContain("بدون پروفایل");
  });

  it("renders no editable control for provenance", async () => {
    for (const source of ["REFERENCE", "AI", "MANUAL", null] as const) {
      const html = await renderEdit(source);

      expect(html).not.toContain('name="profileSource"');
      expect(html).not.toContain("<select");
      expect(html).not.toContain("<textarea");
    }
  });

  it("states that editing values does not change the recorded source", async () => {
    // The §5 contract, made visible: a manually edited AI profile stays "AI".
    const html = await renderEdit("AI");

    expect(html).toContain("با ویرایش مقادیر، منبع پروفایل تغییر نمی‌کند");
  });

  it("does not render the edit form for a cross-store perfume", async () => {
    mocks.getPerfumeForStore.mockResolvedValue(null);

    const element = await EditPerfumePage({
      params: Promise.resolve({ id: "perfume-1" }),
      searchParams: Promise.resolve({ store: "store-1" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("عطر پیدا نشد");
    expect(html).not.toContain("data-profile-source");
  });
});
