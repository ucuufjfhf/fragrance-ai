import { describe, expect, it } from "vitest";

import { eligibleGendersFor } from "@/lib/audience";
import { MATCHING_DIMENSIONS, PROFILE_AXES } from "@/lib/fragrance/profile";
import {
  getCuratedDemoPerfumes,
  getCuratedDemoPerfumesByGender,
} from "@/lib/matching/curated-catalog";
import { matchPerfumes } from "@/lib/matching/engine";
import { getReferenceCatalogCandidates } from "@/lib/matching/reference-catalog";
import type { Gender } from "@/types/fragrance";
import type { PersonalityVector } from "@/types/personality";
import type { MatchCandidateInput } from "@/types/recommendation";

/**
 * Audience eligibility inside the deterministic engine.
 *
 * The audience is a merchandising filter, never a personality dimension: it can
 * only ADD exclusions to the candidate pass that already existed (store, active,
 * inStock, complete profile) and it runs BEFORE any similarity scoring. With no
 * audience selected the engine must behave exactly as it did before.
 */

const flat = (value = 50): PersonalityVector =>
  Object.fromEntries(PROFILE_AXES.map((axis) => [axis, value])) as PersonalityVector;

/** Flat(50) profile with optional overrides on the five matching axes. */
function perfumeCandidate(
  perfumeId: string,
  gender: unknown,
  scent: Partial<Record<(typeof MATCHING_DIMENSIONS)[number], number>> = {},
): MatchCandidateInput {
  return {
    perfumeId,
    storeId: "store-a",
    name: `عطر ${perfumeId}`,
    brand: "برند نمونه",
    slug: null,
    productUrl: null,
    imageUrl: null,
    gender: gender as Gender | null | undefined,
    active: true,
    inStock: true,
    profile: { ...flat(50), ...scent },
  };
}

const orderedIds = (result: { recommendations: { perfumeId: string }[] }): string[] =>
  result.recommendations.map((recommendation) => recommendation.perfumeId);

const INVENTORY: MatchCandidateInput[] = [
  perfumeCandidate("p-men", "MEN"),
  perfumeCandidate("p-women", "WOMEN"),
  perfumeCandidate("p-unisex", "UNISEX"),
];

describe("audience eligibility (engine)", () => {
  it("MEN keeps MEN + UNISEX and excludes WOMEN", () => {
    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: INVENTORY,
      targetGender: "MEN",
      topN: 10,
    });

    expect(orderedIds(result)).toEqual(["p-men", "p-unisex"]);
    expect(result.excluded).toBe(1);
  });

  it("WOMEN keeps WOMEN + UNISEX and excludes MEN", () => {
    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: INVENTORY,
      targetGender: "WOMEN",
      topN: 10,
    });

    expect(orderedIds(result)).toEqual(["p-unisex", "p-women"]);
    expect(result.excluded).toBe(1);
  });

  it("excludes an opposite-gender perfect match instead of ranking it first", () => {
    const inventory = [
      perfumeCandidate("p-women-perfect", "WOMEN"),
      perfumeCandidate("p-men-good", "MEN", { fresh: 60 }),
      perfumeCandidate("p-unisex-ok", "UNISEX", { fresh: 40, warm: 45 }),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetGender: "MEN",
      topN: 10,
    });

    expect(orderedIds(result)).toEqual(["p-men-good", "p-unisex-ok"]);
    expect(orderedIds(result)).not.toContain("p-women-perfect");
    expect(result.excluded).toBe(1);
  });

  it("excludes genderless and invalid-gender candidates when a target is selected", () => {
    const inventory = [
      perfumeCandidate("p-missing", undefined),
      perfumeCandidate("p-null", null),
      perfumeCandidate("p-invalid", "OTHER"),
      perfumeCandidate("p-unisex", "UNISEX"),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetGender: "MEN",
      topN: 10,
    });

    expect(orderedIds(result)).toEqual(["p-unisex"]);
    expect(result.excluded).toBe(3);
  });

  it("preserves the legacy unfiltered behaviour when no target is given", () => {
    const noTarget = matchPerfumes({
      personalityVector: flat(),
      perfumes: INVENTORY,
      topN: 10,
    });
    const nullTarget = matchPerfumes({
      personalityVector: flat(),
      perfumes: INVENTORY,
      targetGender: null,
      topN: 10,
    });
    const undefinedTarget = matchPerfumes({
      personalityVector: flat(),
      perfumes: INVENTORY,
      targetGender: undefined,
      topN: 10,
    });

    expect(orderedIds(noTarget)).toEqual(["p-men", "p-unisex", "p-women"]);
    expect(noTarget.excluded).toBe(0);
    expect(nullTarget).toEqual(noTarget);
    expect(undefinedTarget).toEqual(noTarget);
  });

  it("is exactly equivalent to pre-filtering the inventory (filtering happens BEFORE scoring)", () => {
    const inventory = [
      perfumeCandidate("a", "MEN", { fresh: 10 }),
      perfumeCandidate("b", "WOMEN", { fresh: 90 }),
      perfumeCandidate("c", "UNISEX", { warm: 30 }),
      perfumeCandidate("d", null, { bold: 70 }),
    ];
    const eligible = new Set(eligibleGendersFor("MEN"));

    const filteredByEngine = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetGender: "MEN",
      topN: 10,
    });
    const preFiltered = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory.filter((perfume) => eligible.has(perfume.gender as Gender)),
      topN: 10,
    });

    expect(orderedIds(filteredByEngine)).toEqual(["c", "a"]);
    expect(filteredByEngine.recommendations).toEqual(preFiltered.recommendations);
    expect(
      filteredByEngine.recommendations.map((r) => [r.perfumeId, r.distance, r.score, r.presentationScore]),
    ).toEqual(
      preFiltered.recommendations.map((r) => [r.perfumeId, r.distance, r.score, r.presentationScore]),
    );
  });

  it("never changes scores or ordering — MEN and WOMEN agree on a UNISEX-only pool", () => {
    const inventory = [
      perfumeCandidate("u1", "UNISEX", { fresh: 70 }),
      perfumeCandidate("u2", "UNISEX", { warm: 80 }),
      perfumeCandidate("u3", "UNISEX"),
    ];

    const men = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetGender: "MEN",
      topN: 10,
    });
    const women = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetGender: "WOMEN",
      topN: 10,
    });

    expect(men).toEqual(women);
  });

  it("keeps MATCHING_DIMENSIONS exactly as PR #4 defined them", () => {
    expect([...MATCHING_DIMENSIONS]).toEqual([
      "fresh",
      "warm",
      "mysterious",
      "elegant",
      "bold",
    ]);
  });

  it("still requires a complete nine-axis profile when a target is selected", () => {
    const incompleteProfile: Record<string, number> = { ...flat(50) };
    delete incompleteProfile.bold;

    const inventory: MatchCandidateInput[] = [
      {
        ...perfumeCandidate("p-partial", "MEN"),
        profile: incompleteProfile as MatchCandidateInput["profile"],
      },
      perfumeCandidate("p-complete", "MEN"),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetGender: "MEN",
      topN: 10,
    });

    expect(orderedIds(result)).toEqual(["p-complete"]);
    expect(result.excluded).toBe(1);
  });
});

describe("curated demo catalog audience metadata (REFERENCE_CATALOG)", () => {
  const candidates = getReferenceCatalogCandidates();
  const curated = getCuratedDemoPerfumes();
  const curatedById = new Map(curated.map((entry) => [`ref-${entry.id}`, entry]));
  const genderById = new Map(candidates.map((entry) => [entry.perfumeId, entry.gender]));

  it("reuses the existing curated targetGender on every candidate", () => {
    expect(candidates).toHaveLength(curated.length);

    for (const entry of candidates) {
      const curatedEntry = curatedById.get(entry.perfumeId);

      expect(curatedEntry).toBeDefined();
      expect(entry.gender).toBe(curatedEntry?.targetGender.toUpperCase());
    }
  });

  it("filters the demo pool by audience without touching scoring", () => {
    const men = matchPerfumes({
      personalityVector: flat(),
      perfumes: candidates,
      targetGender: "MEN",
      topN: candidates.length,
    });
    const women = matchPerfumes({
      personalityVector: flat(),
      perfumes: candidates,
      targetGender: "WOMEN",
      topN: candidates.length,
    });

    const menExpected =
      getCuratedDemoPerfumesByGender("men").length +
      getCuratedDemoPerfumesByGender("unisex").length;
    const womenExpected =
      getCuratedDemoPerfumesByGender("women").length +
      getCuratedDemoPerfumesByGender("unisex").length;

    expect(men.recommendations).toHaveLength(menExpected);
    expect(women.recommendations).toHaveLength(womenExpected);
    expect(men.excluded).toBe(candidates.length - menExpected);
    expect(women.excluded).toBe(candidates.length - womenExpected);

    for (const recommendation of men.recommendations) {
      expect(["MEN", "UNISEX"]).toContain(genderById.get(recommendation.perfumeId));
    }

    for (const recommendation of women.recommendations) {
      expect(["WOMEN", "UNISEX"]).toContain(genderById.get(recommendation.perfumeId));
    }
  });

  it("keeps the demo pool unfiltered when no audience is selected (legacy)", () => {
    const legacy = matchPerfumes({
      personalityVector: flat(),
      perfumes: candidates,
      topN: candidates.length,
    });
    const guarded = matchPerfumes({
      personalityVector: flat(),
      perfumes: candidates,
      targetGender: null,
      topN: candidates.length,
    });

    expect(legacy.recommendations).toHaveLength(candidates.length);
    expect(legacy.excluded).toBe(0);
    expect(guarded).toEqual(legacy);
  });

  it("is deterministic with an audience selected", () => {
    const first = matchPerfumes({
      personalityVector: flat(),
      perfumes: candidates,
      targetGender: "WOMEN",
      topN: 50,
    });
    const second = matchPerfumes({
      personalityVector: flat(),
      perfumes: candidates,
      targetGender: "WOMEN",
      topN: 50,
    });

    expect(first).toEqual(second);
  });
});
