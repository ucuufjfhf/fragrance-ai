import { describe, expect, it } from "vitest";

import {
  CONTEXT_HEADING,
  NO_PREFERENCE_ID,
  NO_PREFERENCE_LABEL,
  OCCASIONS,
  OCCASION_OPTIONS,
  OCCASION_QUESTION,
  SEASON_FILTERS,
  SEASON_OPTIONS,
  SEASON_QUESTION,
  isOccasion,
  isOccasionEligible,
  isSeasonEligible,
  isSeasonFilter,
  occasionToUrlToken,
  parseOccasionToken,
  parseSeasonToken,
  seasonToUrlToken,
} from "@/lib/context";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";

/**
 * Purchase context (season + occasion): a merchandising step, NOT a
 * personality dimension.
 *
 * These tests pin the approved copy, the internal values, the strict
 * eligibility rules (including the ALL-season widening and the deliberate
 * exclusion of untagged perfumes) and the lenient URL behaviour that keeps
 * legacy links working.
 */

/** Persian copy mixes zero-width non-joiners; compare without them. */
function withoutJoiners(value: string): string {
  return value.replace(/\u200c/g, "");
}

describe("purchase-context domain", () => {
  it("declares exactly the four restrictive seasons", () => {
    expect(SEASON_FILTERS).toEqual(["SPRING", "SUMMER", "AUTUMN", "WINTER"]);
    expect(SEASON_FILTERS).not.toContain("ALL");
    expect(SEASON_OPTIONS.map((option) => option.id)).toEqual([
      "SPRING",
      "SUMMER",
      "AUTUMN",
      "WINTER",
    ]);
  });

  it("declares exactly the five stored occasions (no invented ALL value)", () => {
    expect(OCCASIONS).toEqual(["DAILY", "DATE", "PARTY", "OFFICE", "FORMAL"]);
    expect(OCCASIONS).not.toContain("ALL");
    expect(OCCASION_OPTIONS.map((option) => option.id)).toEqual([
      "DAILY",
      "DATE",
      "PARTY",
      "OFFICE",
      "FORMAL",
    ]);
  });

  it("uses the approved Persian copy, pinned character by character", () => {
    expect(withoutJoiners(CONTEXT_HEADING)).toBe(
      withoutJoiners("حالا کمی دقیق‌ترش کنیم"),
    );
    expect(withoutJoiners(SEASON_QUESTION)).toBe(
      withoutJoiners("بیشتر برای چه فصلی می‌خوای؟"),
    );
    expect(withoutJoiners(OCCASION_QUESTION)).toBe(
      withoutJoiners("بیشتر برای چه موقعیتی می‌خوای؟"),
    );
    expect(withoutJoiners(NO_PREFERENCE_LABEL)).toBe(
      withoutJoiners("فرقی نمی‌کنه"),
    );
    expect(NO_PREFERENCE_ID).toBe("NONE");
  });

  it("uses the approved Persian option labels, in order", () => {
    expect(SEASON_OPTIONS.map((option) => option.label)).toEqual([
      "بهار",
      "تابستان",
      "پاییز",
      "زمستان",
    ]);
    expect(OCCASION_OPTIONS.map((option) => option.label)).toEqual([
      "روزمره",
      "قرار",
      "مهمانی",
      "محل کار",
      "رسمی",
    ]);
  });

  it("is separate from the 10-question personality bank", () => {
    expect(QUIZ_QUESTIONS).toHaveLength(10);
    const prompts = QUIZ_QUESTIONS.map((question) => question.prompt);
    expect(prompts).not.toContain(SEASON_QUESTION);
    expect(prompts).not.toContain(OCCASION_QUESTION);
  });

  it("validates internal values strictly", () => {
    expect(isSeasonFilter("SPRING")).toBe(true);
    expect(isSeasonFilter("ALL")).toBe(false);
    expect(isSeasonFilter("spring")).toBe(false);

    for (const invalid of ["", "WINTER ", "FALL", null, undefined, 42, {}]) {
      expect(isSeasonFilter(invalid)).toBe(false);
    }

    expect(isOccasion("DAILY")).toBe(true);
    expect(isOccasion("ALL")).toBe(false);

    for (const invalid of ["", "daily", "CASUAL", null, undefined, 42, {}]) {
      expect(isOccasion(invalid)).toBe(false);
    }
  });
});

describe("season eligibility", () => {
  it("applies no filter when none was selected", () => {
    for (const tag of ["SPRING", "SUMMER", "AUTUMN", "WINTER", "ALL", null, undefined, "BOGUS"]) {
      expect(isSeasonEligible(tag, null)).toBe(true);
      expect(isSeasonEligible(tag, undefined)).toBe(true);
    }
  });

  it("SPRING allows SPRING + ALL and excludes everything else", () => {
    expect(isSeasonEligible("SPRING", "SPRING")).toBe(true);
    expect(isSeasonEligible("ALL", "SPRING")).toBe(true);
    expect(isSeasonEligible("SUMMER", "SPRING")).toBe(false);
    expect(isSeasonEligible("AUTUMN", "SPRING")).toBe(false);
    expect(isSeasonEligible("WINTER", "SPRING")).toBe(false);
    expect(isSeasonEligible(null, "SPRING")).toBe(false);
    expect(isSeasonEligible(undefined, "SPRING")).toBe(false);
    expect(isSeasonEligible("BOGUS", "SPRING")).toBe(false);
  });

  it("SUMMER allows SUMMER + ALL and excludes everything else", () => {
    expect(isSeasonEligible("SUMMER", "SUMMER")).toBe(true);
    expect(isSeasonEligible("ALL", "SUMMER")).toBe(true);
    expect(isSeasonEligible("SPRING", "SUMMER")).toBe(false);
    expect(isSeasonEligible(null, "SUMMER")).toBe(false);
  });

  it("AUTUMN allows AUTUMN + ALL and excludes everything else", () => {
    expect(isSeasonEligible("AUTUMN", "AUTUMN")).toBe(true);
    expect(isSeasonEligible("ALL", "AUTUMN")).toBe(true);
    expect(isSeasonEligible("WINTER", "AUTUMN")).toBe(false);
    expect(isSeasonEligible(null, "AUTUMN")).toBe(false);
  });

  it("WINTER allows WINTER + ALL and excludes everything else", () => {
    expect(isSeasonEligible("WINTER", "WINTER")).toBe(true);
    expect(isSeasonEligible("ALL", "WINTER")).toBe(true);
    expect(isSeasonEligible("SPRING", "WINTER")).toBe(false);
    expect(isSeasonEligible(null, "WINTER")).toBe(false);
  });
});

describe("occasion eligibility", () => {
  it("applies no filter when none was selected", () => {
    for (const tag of ["DAILY", "DATE", "PARTY", "OFFICE", "FORMAL", null, undefined, "BOGUS"]) {
      expect(isOccasionEligible(tag, null)).toBe(true);
      expect(isOccasionEligible(tag, undefined)).toBe(true);
    }
  });

  it("allows exactly the selected occasion and nothing else", () => {
    for (const occasion of ["DAILY", "DATE", "PARTY", "OFFICE", "FORMAL"] as const) {
      expect(isOccasionEligible(occasion, occasion)).toBe(true);

      for (const other of ["DAILY", "DATE", "PARTY", "OFFICE", "FORMAL"] as const) {
        if (other !== occasion) {
          expect(isOccasionEligible(other, occasion)).toBe(false);
        }
      }

      // No ALL widening exists for occasions; untagged never matches.
      expect(isOccasionEligible("ALL", occasion)).toBe(false);
      expect(isOccasionEligible(null, occasion)).toBe(false);
      expect(isOccasionEligible(undefined, occasion)).toBe(false);
    }
  });
});

describe("context URL tokens", () => {
  it("serialises seasons as lowercase tokens and round-trips", () => {
    expect(seasonToUrlToken("SPRING")).toBe("spring");
    expect(seasonToUrlToken("SUMMER")).toBe("summer");
    expect(seasonToUrlToken("AUTUMN")).toBe("autumn");
    expect(seasonToUrlToken("WINTER")).toBe("winter");

    for (const season of ["SPRING", "SUMMER", "AUTUMN", "WINTER"] as const) {
      expect(parseSeasonToken(seasonToUrlToken(season))).toBe(season);
    }
  });

  it("parses leniently: malformed, empty or unknown → null (no filter)", () => {
    for (const raw of ["", "   ", "fall", "ALL", "all", "xyz", "springg", null, undefined]) {
      expect(parseSeasonToken(raw)).toBeNull();
    }

    // Differing case still resolves — legacy hand-edited links keep working.
    expect(parseSeasonToken(" Summer ")).toBe("SUMMER");
  });

  it("serialises occasions as lowercase tokens and round-trips", () => {
    expect(occasionToUrlToken("DAILY")).toBe("daily");
    expect(occasionToUrlToken("DATE")).toBe("date");
    expect(occasionToUrlToken("PARTY")).toBe("party");
    expect(occasionToUrlToken("OFFICE")).toBe("office");
    expect(occasionToUrlToken("FORMAL")).toBe("formal");

    for (const occasion of ["DAILY", "DATE", "PARTY", "OFFICE", "FORMAL"] as const) {
      expect(parseOccasionToken(occasionToUrlToken(occasion))).toBe(occasion);
    }
  });

  it("parses occasion leniently: malformed → null (no filter)", () => {
    for (const raw of ["", "  ", "casual", "DAILYY", "all", null, undefined]) {
      expect(parseOccasionToken(raw)).toBeNull();
    }

    expect(parseOccasionToken(" Party ")).toBe("PARTY");
  });
});
