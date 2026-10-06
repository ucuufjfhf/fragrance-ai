import { describe, expect, it } from "vitest";

import { MATCHING_DIMENSIONS, PROFILE_AXES } from "@/lib/fragrance/profile";
import { matchPerfumes } from "@/lib/matching/engine";
import type { Gender, Occasion, Season } from "@/types/fragrance";
import type { PersonalityVector } from "@/types/personality";
import type { MatchCandidateInput } from "@/types/recommendation";

/**
 * Optional season + occasion eligibility inside the deterministic engine.
 *
 * The purchase context is a merchandising filter, never a personality
 * dimension: it can only ADD exclusions to the candidate pass that already
 * existed (store, active, inStock, audience, complete profile) and it runs
 * BEFORE any similarity scoring — scores and ranks of the survivors are
 * byte-identical to an unfiltered run. With no context selected the engine
 * must behave exactly as it did before.
 */

const flat = (value = 50): PersonalityVector =>
  Object.fromEntries(PROFILE_AXES.map((axis) => [axis, value])) as PersonalityVector;

interface CandidateOptions {
  gender?: Gender | null;
  season?: Season | null;
  occasion?: Occasion | null;
  active?: boolean;
  inStock?: boolean;
  profile?: Partial<Record<(typeof MATCHING_DIMENSIONS)[number], number>> | null;
}

/** Flat(50) profile with explicit merchandising tags and inventory flags. */
function perfumeCandidate(
  perfumeId: string,
  options: CandidateOptions = {},
): MatchCandidateInput {
  const {
    gender = "UNISEX",
    season = null,
    occasion = null,
    active = true,
    inStock = true,
    profile = {},
  } = options;

  return {
    perfumeId,
    storeId: "store-a",
    name: `عطر ${perfumeId}`,
    brand: "برند نمونه",
    slug: null,
    productUrl: null,
    imageUrl: null,
    gender,
    season,
    occasion,
    active,
    inStock,
    profile:
      profile === null
        ? null
        : ({
            ...flat(50),
            ...profile,
          } as Partial<Record<PersonalityDimensionStub, number>>),
  };
}

/** The nine stored axes, spelled out so overrides stay readable. */
type PersonalityDimensionStub = (typeof PROFILE_AXES)[number];

const orderedIds = (result: {
  recommendations: { perfumeId: string }[];
}): string[] => result.recommendations.map((recommendation) => recommendation.perfumeId);

describe("season eligibility (engine)", () => {
  it("1 — with no season/occasion selected nothing is filtered (legacy behaviour)", () => {
    const inventory = [
      perfumeCandidate("p-spring", { season: "SPRING" }),
      perfumeCandidate("p-winter", { season: "WINTER" }),
      perfumeCandidate("p-all", { season: "ALL" }),
      perfumeCandidate("p-untagged"),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      topN: 10,
    });

    expect(orderedIds(result)).toEqual([
      "p-all",
      "p-spring",
      "p-untagged",
      "p-winter",
    ]);
    expect(result.excluded).toBe(0);
  });

  it("2 — SPRING keeps SPRING + ALL and excludes other seasons and untagged", () => {
    const inventory = [
      perfumeCandidate("p-spring", { season: "SPRING" }),
      perfumeCandidate("p-all", { season: "ALL" }),
      perfumeCandidate("p-summer", { season: "SUMMER" }),
      perfumeCandidate("p-winter", { season: "WINTER" }),
      perfumeCandidate("p-untagged"),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetSeason: "SPRING",
      topN: 10,
    });

    expect(orderedIds(result).sort()).toEqual(["p-all", "p-spring"]);
    expect(result.excluded).toBe(3);
  });

  it("3 — SUMMER keeps SUMMER + ALL and excludes everything else", () => {
    const inventory = [
      perfumeCandidate("p-summer", { season: "SUMMER" }),
      perfumeCandidate("p-all", { season: "ALL" }),
      perfumeCandidate("p-spring", { season: "SPRING" }),
      perfumeCandidate("p-autumn", { season: "AUTUMN" }),
      perfumeCandidate("p-untagged"),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetSeason: "SUMMER",
      topN: 10,
    });

    expect(orderedIds(result).sort()).toEqual(["p-all", "p-summer"]);
    expect(result.excluded).toBe(3);
  });

  it("4 — AUTUMN keeps AUTUMN + ALL and excludes everything else", () => {
    const inventory = [
      perfumeCandidate("p-autumn", { season: "AUTUMN" }),
      perfumeCandidate("p-all", { season: "ALL" }),
      perfumeCandidate("p-spring", { season: "SPRING" }),
      perfumeCandidate("p-winter", { season: "WINTER" }),
      perfumeCandidate("p-untagged"),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetSeason: "AUTUMN",
      topN: 10,
    });

    expect(orderedIds(result).sort()).toEqual(["p-all", "p-autumn"]);
    expect(result.excluded).toBe(3);
  });

  it("5 — WINTER keeps WINTER + ALL and excludes everything else", () => {
    const inventory = [
      perfumeCandidate("p-winter", { season: "WINTER" }),
      perfumeCandidate("p-all", { season: "ALL" }),
      perfumeCandidate("p-summer", { season: "SUMMER" }),
      perfumeCandidate("p-autumn", { season: "AUTUMN" }),
      perfumeCandidate("p-untagged"),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetSeason: "WINTER",
      topN: 10,
    });

    expect(orderedIds(result).sort()).toEqual(["p-all", "p-winter"]);
    expect(result.excluded).toBe(3);
  });
});

describe("occasion eligibility (engine)", () => {
  it("6 — each occasion keeps only its exact tag (no ALL widening exists)", () => {
    const occasions = ["DAILY", "DATE", "PARTY", "OFFICE", "FORMAL"] as const;

    for (const selected of occasions) {
      const inventory = occasions.map((tag) =>
        perfumeCandidate(`p-${tag.toLowerCase()}`, { occasion: tag }),
      );
      inventory.push(perfumeCandidate("p-untagged", { occasion: null }));

      const result = matchPerfumes({
        personalityVector: flat(),
        perfumes: inventory,
        targetOccasion: selected,
        topN: 10,
      });

      expect(orderedIds(result)).toEqual([`p-${selected.toLowerCase()}`]);
      expect(result.excluded).toBe(occasions.length);
    }
  });

  it("6b — with no occasion selected every tagged and untagged perfume stays", () => {
    const inventory = [
      perfumeCandidate("p-daily", { occasion: "DAILY" }),
      perfumeCandidate("p-formal", { occasion: "FORMAL" }),
      perfumeCandidate("p-untagged"),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      topN: 10,
    });

    expect(result.recommendations).toHaveLength(3);
    expect(result.excluded).toBe(0);
  });
});

describe("combined context filtering (engine)", () => {
  it("7 — season + occasion both apply (intersection, not union)", () => {
    const inventory = [
      perfumeCandidate("p-summer-party", { season: "SUMMER", occasion: "PARTY" }),
      perfumeCandidate("p-summer-daily", { season: "SUMMER", occasion: "DAILY" }),
      perfumeCandidate("p-spring-party", { season: "SPRING", occasion: "PARTY" }),
      perfumeCandidate("p-all-party", { season: "ALL", occasion: "PARTY" }),
      perfumeCandidate("p-all-daily", { season: "ALL", occasion: "DAILY" }),
      perfumeCandidate("p-winter-party", { season: "WINTER", occasion: "PARTY" }),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetSeason: "SUMMER",
      targetOccasion: "PARTY",
      topN: 10,
    });

    expect(orderedIds(result).sort()).toEqual(["p-all-party", "p-summer-party"]);
    expect(result.excluded).toBe(4);
  });

  it("8 — audience + season apply together", () => {
    const inventory = [
      perfumeCandidate("p-men-spring", { gender: "MEN", season: "SPRING" }),
      perfumeCandidate("p-unisex-spring", { gender: "UNISEX", season: "SPRING" }),
      perfumeCandidate("p-unisex-all", { gender: "UNISEX", season: "ALL" }),
      perfumeCandidate("p-women-spring", { gender: "WOMEN", season: "SPRING" }),
      perfumeCandidate("p-men-summer", { gender: "MEN", season: "SUMMER" }),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetGender: "MEN",
      targetSeason: "SPRING",
      topN: 10,
    });

    expect(orderedIds(result).sort()).toEqual([
      "p-men-spring",
      "p-unisex-all",
      "p-unisex-spring",
    ]);
    expect(result.excluded).toBe(2);
  });

  it("9 — audience + occasion apply together", () => {
    const inventory = [
      perfumeCandidate("p-women-date", { gender: "WOMEN", occasion: "DATE" }),
      perfumeCandidate("p-unisex-date", { gender: "UNISEX", occasion: "DATE" }),
      perfumeCandidate("p-men-date", { gender: "MEN", occasion: "DATE" }),
      perfumeCandidate("p-women-party", { gender: "WOMEN", occasion: "PARTY" }),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetGender: "WOMEN",
      targetOccasion: "DATE",
      topN: 10,
    });

    expect(orderedIds(result).sort()).toEqual(["p-unisex-date", "p-women-date"]);
    expect(result.excluded).toBe(2);
  });

  it("10 — audience + season + occasion all apply together", () => {
    const inventory = [
      perfumeCandidate("p-hit", {
        gender: "UNISEX",
        season: "WINTER",
        occasion: "FORMAL",
      }),
      perfumeCandidate("p-all-tags", {
        gender: "UNISEX",
        season: "ALL",
        occasion: "FORMAL",
      }),
      perfumeCandidate("p-wrong-gender", {
        gender: "WOMEN",
        season: "WINTER",
        occasion: "FORMAL",
      }),
      perfumeCandidate("p-wrong-season", {
        gender: "UNISEX",
        season: "SUMMER",
        occasion: "FORMAL",
      }),
      perfumeCandidate("p-wrong-occasion", {
        gender: "UNISEX",
        season: "WINTER",
        occasion: "DAILY",
      }),
      perfumeCandidate("p-untagged-season", {
        gender: "UNISEX",
        season: null,
        occasion: "FORMAL",
      }),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetGender: "MEN",
      targetSeason: "WINTER",
      targetOccasion: "FORMAL",
      topN: 10,
    });

    expect(orderedIds(result).sort()).toEqual(["p-all-tags", "p-hit"]);
    expect(result.excluded).toBe(4);
  });

  it("11 — out-of-stock perfumes stay excluded while a context is active", () => {
    const inventory = [
      perfumeCandidate("p-spring-out", { season: "SPRING", inStock: false }),
      perfumeCandidate("p-spring-ok", { season: "SPRING" }),
      perfumeCandidate("p-summer-ok", { season: "SUMMER" }),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetSeason: "SPRING",
      topN: 10,
    });

    expect(orderedIds(result)).toEqual(["p-spring-ok"]);
    expect(result.excluded).toBe(2);
  });

  it("12 — incomplete fragrance profiles stay excluded while a context is active", () => {
    const inventory = [
      perfumeCandidate("p-spring-noprofile", { season: "SPRING", profile: null }),
      perfumeCandidate("p-spring-ok", { season: "SPRING" }),
      perfumeCandidate("p-spring-inactive", { season: "SPRING", active: false }),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetSeason: "SPRING",
      topN: 10,
    });

    expect(orderedIds(result)).toEqual(["p-spring-ok"]);
    expect(result.excluded).toBe(2);
  });

  it("13 — filters run BEFORE scoring: a filtered perfect match is never ranked", () => {
    // p-winter-perfect is an EXACT match on every matching axis — if the
    // season filter ran after scoring (or was ignored) it would rank first.
    const inventory = [
      perfumeCandidate("p-winter-perfect", {
        season: "WINTER",
        profile: { fresh: 60, warm: 60, mysterious: 60, elegant: 60, bold: 60 },
      }),
      perfumeCandidate("p-spring-good", { season: "SPRING", profile: { fresh: 55 } }),
      perfumeCandidate("p-spring-ok", { season: "SPRING" }),
    ];

    const result = matchPerfumes({
      personalityVector: flat(60),
      perfumes: inventory,
      targetSeason: "SPRING",
      topN: 10,
    });

    expect(orderedIds(result)).not.toContain("p-winter-perfect");
    expect(orderedIds(result)).toEqual(["p-spring-good", "p-spring-ok"]);
    expect(result.excluded).toBe(1);
  });

  it("13b — the context never changes scores or order of the survivors", () => {
    const inventory = [
      perfumeCandidate("p-spring-a", { season: "SPRING", profile: { fresh: 60 } }),
      perfumeCandidate("p-spring-b", { season: "SPRING", profile: { fresh: 45 } }),
      perfumeCandidate("p-spring-c", { season: "SPRING" }),
      perfumeCandidate("p-winter-x", { season: "WINTER", profile: { fresh: 99 } }),
    ];

    const unfiltered = matchPerfumes({
      personalityVector: flat(60),
      perfumes: inventory,
      topN: 10,
    });

    const filtered = matchPerfumes({
      personalityVector: flat(60),
      perfumes: inventory,
      targetSeason: "SPRING",
      topN: 10,
    });

    const survivors = unfiltered.recommendations.filter(
      (recommendation) => recommendation.perfumeId !== "p-winter-x",
    );

    expect(filtered.recommendations).toEqual(survivors);
    // Identical raw scores — the filter only removes candidates.
    expect(filtered.recommendations.map((item) => item.score)).toEqual(
      survivors.map((item) => item.score),
    );
  });

  it("14 — a fully filtered inventory yields an empty result, never a bypass", () => {
    const inventory = [
      perfumeCandidate("p-spring", { season: "SPRING" }),
      perfumeCandidate("p-summer", { season: "SUMMER" }),
      perfumeCandidate("p-untagged"),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      targetSeason: "WINTER",
      targetOccasion: "PARTY",
      topN: 10,
    });

    expect(result.recommendations).toEqual([]);
    expect(result.excluded).toBe(3);
  });

  it("an invalid target (not a known season/occasion) behaves as no filter", () => {
    const inventory = [
      perfumeCandidate("p-spring", { season: "SPRING" }),
      perfumeCandidate("p-untagged"),
    ];

    const result = matchPerfumes({
      personalityVector: flat(),
      perfumes: inventory,
      // Hand-built/legacy callers may pass junk; the predicate degrades to
      // "no filter" exactly like the audience/URL behaviour.
      targetSeason: "BOGUS" as never,
      targetOccasion: "BOGUS" as never,
      topN: 10,
    });

    expect(result.recommendations).toHaveLength(2);
    expect(result.excluded).toBe(0);
  });
});
