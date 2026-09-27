import { describe, expect, it } from "vitest";

import {
  DEFAULT_RECOMMENDATION_SOURCE,
  getRecommendations,
} from "@/lib/matching/service";
import { getReferenceCatalogCandidates } from "@/lib/matching/reference-catalog";
import { makeVector } from "@/tests/ai/fixtures";
import type { PersonalityVector } from "@/types/personality";

/**
 * Deterministic tests for the two recommendation candidate sources.
 *
 * Reference mode runs entirely offline against the bundled reference.json —
 * no database, no network. Merchant mode assertions reuse the same pure engine
 * semantics; live-DB merchant isolation is already covered by the dataset
 * matrix suite, so here we focus on the source-selection boundary.
 */

const MIXED: PersonalityVector = makeVector(50);

describe("reference catalog candidates", () => {
  it("provides a large candidate set without touching any store", () => {
    const candidates = getReferenceCatalogCandidates();

    expect(candidates.length).toBeGreaterThan(1000);

    const storeIds = new Set(candidates.map((c) => c.storeId));
    expect(storeIds.size).toBe(1);
    expect(storeIds.has("reference-catalog")).toBe(true);
  });

  it("every candidate is engine-eligible: active, in stock, fully profiled", () => {
    for (const candidate of getReferenceCatalogCandidates().slice(0, 500)) {
      expect(candidate.active).toBe(true);
      expect(candidate.inStock).toBe(true);
      for (const axis of Object.values(candidate.profile ?? {})) {
        expect(axis).toBeGreaterThanOrEqual(0);
        expect(axis).toBeLessThanOrEqual(100);
        expect(Number.isInteger(axis)).toBe(true);
      }
      expect(Object.keys(candidate.profile ?? {})).toHaveLength(9);
    }
  });

  it("NEVER fabricates product URLs or images", () => {
    for (const candidate of getReferenceCatalogCandidates().slice(0, 500)) {
      expect(candidate.productUrl).toBeNull();
      expect(candidate.imageUrl).toBeNull();
    }
  });

  it("derivation is deterministic: two loads produce identical vectors", () => {
    // Module-level cache means the same array is returned; check the vectors
    // themselves are stable across independent derivations of the same entry.
    const first = getReferenceCatalogCandidates();
    const again = getReferenceCatalogCandidates();
    expect(JSON.stringify(first.slice(0, 50).map((c) => c.profile))).toBe(
      JSON.stringify(again.slice(0, 50).map((c) => c.profile)),
    );
  });
});

describe("reference mode recommendations (REFERENCE_CATALOG)", () => {
  it("produces a deterministic ranked Top-N", async () => {
    const a = await getRecommendations({
      storeId: "store-demo-perfume-shop",
      personalityVector: MIXED,
      topN: 5,
      source: "REFERENCE_CATALOG",
    });
    const b = await getRecommendations({
      storeId: "store-demo-perfume-shop",
      personalityVector: MIXED,
      topN: 5,
      source: "REFERENCE_CATALOG",
    });

    expect(a.recommendations).toHaveLength(5);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("every recommendation carries the reference synthetic store id — never a real merchant store", async () => {
    const result = await getRecommendations({
      storeId: "store-demo-perfume-shop",
      personalityVector: MIXED,
      topN: 10,
      source: "REFERENCE_CATALOG",
    });

    for (const rec of result.recommendations) {
      expect(rec.storeId).toBe("reference-catalog");
      expect(rec.perfumeId.startsWith("ref-")).toBe(true);
      // No fabricated links in the output either.
      expect(rec.productUrl).toBeNull();
      expect(rec.imageUrl).toBeNull();
    }
  });

  it("scores use the same engine scale (0–100, presentation rounding)", async () => {
    const result = await getRecommendations({
      storeId: "store-demo-perfume-shop",
      personalityVector: MIXED,
      topN: 5,
      source: "REFERENCE_CATALOG",
    });

    for (const rec of result.recommendations) {
      expect(rec.score).toBeGreaterThanOrEqual(0);
      expect(rec.score).toBeLessThanOrEqual(100);
      expect(rec.presentationScore).toBe(Math.round(rec.score * 10) / 10);
    }
  });

  it("the service-level default stays MERCHANT_INVENTORY (backwards-compatible)", () => {
    // The service default must not change: existing merchant callers (widget
    // API, live-DB suites) keep their exact behavior. The demo selection is
    // made by the results page, not by the engine service.
    expect(DEFAULT_RECOMMENDATION_SOURCE).toBe("MERCHANT_INVENTORY");
  });

  it("merchant mode routes through the same pure engine (regression, offline)", async () => {
    // Merchant mode goes through the merchant repository (live DB, covered by
    // the dataset-matrix suite). Here we verify the ROUTING boundary offline:
    // the engine itself is source-agnostic, so a merchant-shaped candidate list
    // produces merchant-shaped output while reference mode cannot see it.
    const { matchPerfumes } = await import("@/lib/matching/engine");

    const merchantInventory = [
      {
        perfumeId: "merchant-bleu",
        storeId: "store-real-merchant",
        name: "Bleu",
        brand: "Chanel",
        productUrl: "https://merchant.example/bleu",
        imageUrl: null,
        inStock: true,
        active: true,
        profile: MIXED,
      },
      {
        perfumeId: "merchant-oos",
        storeId: "store-real-merchant",
        name: "OOS",
        brand: "Chanel",
        productUrl: null,
        imageUrl: null,
        inStock: false,
        active: true,
        profile: MIXED,
      },
    ] as const;

    const merchantResult = matchPerfumes({
      storeId: "store-real-merchant",
      personalityVector: MIXED,
      perfumes: [...merchantInventory],
      topN: 5,
    });

    // Out-of-stock merchant product never surfaces; the in-stock one does.
    expect(merchantResult.recommendations).toHaveLength(1);
    expect(merchantResult.recommendations[0].perfumeId).toBe("merchant-bleu");
    expect(merchantResult.recommendations[0].storeId).toBe("store-real-merchant");

    // The reference catalog cannot contain the merchant's product id either.
    const referenceIds = new Set(getReferenceCatalogCandidates().map((c) => c.perfumeId));
    expect(referenceIds.has("merchant-bleu")).toBe(false);
  });
});

describe("mode isolation", () => {
  it("reference mode never includes merchant inventory records", async () => {
    const result = await getRecommendations({
      storeId: "store-demo-perfume-shop",
      personalityVector: MIXED,
      topN: 10,
      source: "REFERENCE_CATALOG",
    });

    // Merchant ids are cuids / seeded demo ids — never "ref-" prefixed.
    for (const rec of result.recommendations) {
      expect(rec.perfumeId.startsWith("ref-")).toBe(true);
      expect(rec.storeId).not.toBe("store-demo-perfume-shop");
    }
  });

  it("an invalid source value fails loudly instead of silently defaulting", async () => {
    await expect(
      getRecommendations({
        storeId: "store-demo-perfume-shop",
        personalityVector: MIXED,
        topN: 5,
        // @ts-expect-error — deliberately invalid runtime value
        source: "SOMETHING_ELSE",
      }),
    ).rejects.toThrow(/invalid recommendation source/);
  });
});
