import { describe, expect, it } from "vitest";

import {
  CURATED_DEMO_COUNT,
  CuratedCatalogError,
  getCuratedDemoPerfumes,
  getCuratedDemoPerfumesByGender,
} from "@/lib/matching/curated-catalog";
import { getReferenceCatalogCandidates } from "@/lib/matching/reference-catalog";
import { PERSONALITY_AXES } from "@/lib/fragrance/axis-derivation";
import referenceData from "@/data/fragrantica/reference.json";

/**
 * The curated demo pool is a hand-audited artifact, so these tests are the
 * guard rail that keeps it honest: every declared slug must resolve to exactly
 * one reference record with a complete 9-axis profile. Fully offline — no
 * database, no network, no AI.
 */

const RAW_ENTRIES = (referenceData as {
  entries: { b: string; n: string }[];
}).entries;

describe("curated demo catalog — resolution", () => {
  it("resolves all 59 entries with zero NOT_FOUND", () => {
    // Throws CuratedCatalogError on any unresolvable slug, so simply getting
    // the expected length proves every entry resolved.
    const perfumes = getCuratedDemoPerfumes();

    expect(perfumes).toHaveLength(CURATED_DEMO_COUNT);
    expect(CURATED_DEMO_COUNT).toBe(59);
  });

  it("every explicit slug pair matches EXACTLY one reference record", () => {
    for (const perfume of getCuratedDemoPerfumes()) {
      const hits = RAW_ENTRIES.filter(
        (entry) =>
          entry.b === perfume.referenceBrandSlug &&
          entry.n === perfume.referencePerfumeSlug,
      );

      // Not "> 0": an ambiguous pair would mean the curated file could drift
      // into a flanker without anyone noticing.
      expect(
        hits,
        `${perfume.id} (${perfume.referenceBrandSlug}/${perfume.referencePerfumeSlug}) must match exactly one reference record`,
      ).toHaveLength(1);
    }
  });

  it("never maps two curated entries onto the same reference record", () => {
    const pairs = getCuratedDemoPerfumes().map(
      (p) => `${p.referenceBrandSlug}/${p.referencePerfumeSlug}`,
    );

    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("keeps ids unique and stable for deterministic tie-breaking", () => {
    const ids = getCuratedDemoPerfumes().map((p) => p.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(getCuratedDemoPerfumes().map((p) => p.id)).toEqual(ids);
  });
});

describe("curated demo catalog — profile completeness", () => {
  it("derives a full 9-axis integer profile for every perfume", () => {
    for (const perfume of getCuratedDemoPerfumes()) {
      for (const axis of PERSONALITY_AXES) {
        const value = perfume.profile[axis];

        expect(
          Number.isInteger(value) && value >= 0 && value <= 100,
          `${perfume.id} has an invalid ${axis} value: ${String(value)}`,
        ).toBe(true);
      }

      expect(Object.keys(perfume.profile)).toHaveLength(9);
    }
  });

  it("carries real structured scent data, never empty", () => {
    for (const perfume of getCuratedDemoPerfumes()) {
      expect(perfume.accords.length).toBeGreaterThan(0);
      expect(perfume.notes.length).toBeGreaterThan(0);
      expect(perfume.referenceRating).toBeGreaterThan(0);
      expect(perfume.referenceReviewCount).toBeGreaterThan(0);
    }
  });

  it("derivation is deterministic across loads", () => {
    const first = getCuratedDemoPerfumes().map((p) => p.profile);
    const again = getCuratedDemoPerfumes().map((p) => p.profile);

    expect(JSON.stringify(first)).toBe(JSON.stringify(again));
  });

  it("omits Le Labo Santal 33 — genuinely absent from the dataset", () => {
    // Documented drop: no substitute was invented for it.
    const names = getCuratedDemoPerfumes().map((p) => p.name);

    expect(names.some((n) => n.includes("Santal"))).toBe(false);
    expect(
      RAW_ENTRIES.some(
        (e) => e.b === "le-labo" && e.n.includes("santal"),
      ),
    ).toBe(false);
  });
});

describe("curated demo catalog — merchandising segments", () => {
  it("spreads across men, women and unisex", () => {
    const men = getCuratedDemoPerfumesByGender("men");
    const women = getCuratedDemoPerfumesByGender("women");
    const unisex = getCuratedDemoPerfumesByGender("unisex");

    expect(men.length).toBe(25);
    expect(women.length).toBe(25);
    // 10 proposed for unisex/niche, minus the dropped Santal 33.
    expect(unisex.length).toBe(9);
    expect(men.length + women.length + unisex.length).toBe(
      CURATED_DEMO_COUNT,
    );
  });

  it("keeps every three gender lookups partitioned and exhaustive", () => {
    const all = new Set(getCuratedDemoPerfumes().map((p) => p.id));
    const union = new Set(
      ["men", "women", "unisex"].flatMap(
        (g) =>
          getCuratedDemoPerfumesByGender(
            g as "men" | "women" | "unisex",
          ).map((p) => p.id),
      ),
    );

    expect(union.size).toBe(all.size);
    expect([...union].sort()).toEqual([...all].sort());
  });
});

describe("curated demo catalog — engine candidates", () => {
  it("exposes engine-eligible candidates with no fabricated links", () => {
    for (const candidate of getReferenceCatalogCandidates()) {
      expect(candidate.active).toBe(true);
      expect(candidate.inStock).toBe(true);
      expect(candidate.storeId).toBe("reference-catalog");
      expect(candidate.productUrl).toBeNull();
      expect(candidate.imageUrl).toBeNull();
      expect(candidate.perfumeId.startsWith("ref-")).toBe(true);
    }
  });

  it("cannot silently collapse: the pool is exactly 59, never the raw dump", () => {
    expect(getReferenceCatalogCandidates()).toHaveLength(CURATED_DEMO_COUNT);
    expect(getReferenceCatalogCandidates().length).toBeLessThan(
      RAW_ENTRIES.length,
    );
  });

  it("exposes CuratedCatalogError for callers to catch", () => {
    // The failure mode is a thrown error, never a silent partial pool.
    expect(new CuratedCatalogError("x")).toBeInstanceOf(Error);
    expect(new CuratedCatalogError("x").name).toBe("CuratedCatalogError");
  });
});

describe("curated demo catalog — explicit slugs are load-bearing", () => {
  it("resolves EVERY perfume by slug, including names the ladder cannot match", () => {
    // These are precisely the cases the audit flagged as ambiguous or
    // convention-mismatched. If resolution ever became name-based, these would
    // start failing — which is the point of pinning them explicitly.
    const expected: [string, string][] = [
      ["dior", "sauvage"],
      ["giorgio-armani", "acqua-di-gio"],
      ["versace", "eros"],
      ["azzaro", "the-most-wanted-intense"],
      ["tom-ford", "oud-wood-parfum"],
      ["dior", "dior-homme-intense-2011"],
      ["dior", "dior-homme"],
      ["valentino", "valentino-uomo-born-in-roma"],
      ["giorgio-armani", "emporio-armani-stronger-with-you-intensely"],
      ["chanel", "chanel-no-5-eau-de-parfum"],
      ["dior", "j-adore"],
      ["dior", "miss-dior-eau-de-parfum-2021"],
      ["yves-saint-laurent", "libre"],
      ["prada", "prada-paradoxe"],
      ["burberry", "burberry-her"],
      ["narciso-rodriguez", "narciso-rodriguez-for-her"],
      ["valentino", "valentino-donna-born-in-roma"],
      ["maison-martin-margiela", "by-the-fireplace"],
      ["maison-martin-margiela", "jazz-club"],
      ["xerjoff", "xj-1861-naxos"],
    ];

    const pairs = new Set(
      getCuratedDemoPerfumes().map(
        (p) => `${p.referenceBrandSlug}/${p.referencePerfumeSlug}`,
      ),
    );

    for (const [brand, perfume] of expected) {
      expect(pairs, `missing curated mapping for ${brand}/${perfume}`).toContain(
        `${brand}/${perfume}`,
      );
    }
  });

  it("every curated perfume resolves by slug regardless of its display name", () => {
    // Display names are merchandising copy and are NOT resolution keys.
    // Resolution is by slug only — no display name is used as a lookup input.
    const perfumes = getCuratedDemoPerfumes();

    for (const perfume of perfumes) {
      const bySlug = RAW_ENTRIES.filter(
        (entry) =>
          entry.b === perfume.referenceBrandSlug &&
          entry.n === perfume.referencePerfumeSlug,
      );
      expect(bySlug).toHaveLength(1);
    }
  });
});