import { describe, expect, it } from "vitest";

import {
  AUDIENCE_GENDERS,
  AUDIENCE_OPTIONS,
  AUDIENCE_QUESTION,
  audienceToUrlToken,
  eligibleGendersFor,
  isAudienceGender,
  isGenderEligibleFor,
  parseAudienceToken,
} from "@/lib/audience";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";

/**
 * Audience selection: a merchandising step, NOT a personality dimension.
 *
 * These tests pin the copy, the internal values, the MEN/WOMEN→eligible-gender
 * mapping and the lenient URL behaviour that keeps legacy links working.
 */
describe("audience domain", () => {
  it("declares exactly the two audiences", () => {
    expect(AUDIENCE_GENDERS).toEqual(["MEN", "WOMEN"]);
    expect(AUDIENCE_OPTIONS.map((option) => option.id)).toEqual(["MEN", "WOMEN"]);
  });

  it("uses the approved Persian question, pinned character by character", () => {
    expect(AUDIENCE_QUESTION).toBe(
      "عطری که می\u200cخواهید پیدا کنید، بیشتر برای چه کسی است؟",
    );
  });

  it("uses the approved Persian option labels, in order", () => {
    expect(AUDIENCE_OPTIONS.map((option) => option.label)).toEqual([
      "برای آقایان",
      "برای خانم\u200cها",
    ]);
  });

  it("is separate from the 10-question personality bank", () => {
    expect(QUIZ_QUESTIONS).toHaveLength(10);
    expect(QUIZ_QUESTIONS.map((question) => question.prompt)).not.toContain(
      AUDIENCE_QUESTION,
    );
    expect(QUIZ_QUESTIONS.some((question) => question.id === "audience")).toBe(
      false,
    );
  });

  it("maps MEN to MEN + UNISEX and WOMEN to WOMEN + UNISEX", () => {
    expect(eligibleGendersFor("MEN")).toEqual(["MEN", "UNISEX"]);
    expect(eligibleGendersFor("WOMEN")).toEqual(["WOMEN", "UNISEX"]);
  });

  it("validates the internal values strictly", () => {
    expect(isAudienceGender("MEN")).toBe(true);
    expect(isAudienceGender("WOMEN")).toBe(true);

    for (const invalid of ["men", "UNISEX", "", "MEN ", null, undefined, 42, {}]) {
      expect(isAudienceGender(invalid)).toBe(false);
    }
  });

  describe("isGenderEligibleFor", () => {
    it("keeps EVERY candidate eligible when no audience was selected (legacy)", () => {
      for (const gender of ["MEN", "WOMEN", "UNISEX", undefined, null, "", "OTHER"]) {
        expect(isGenderEligibleFor(gender, null)).toBe(true);
        expect(isGenderEligibleFor(gender, undefined)).toBe(true);
      }
    });

    it("treats an unknown target as no filter instead of throwing", () => {
      expect(isGenderEligibleFor("WOMEN", "OTHER" as never)).toBe(true);
    });

    it("MEN keeps MEN + UNISEX and excludes the rest", () => {
      expect(isGenderEligibleFor("MEN", "MEN")).toBe(true);
      expect(isGenderEligibleFor("UNISEX", "MEN")).toBe(true);
      expect(isGenderEligibleFor("WOMEN", "MEN")).toBe(false);

      for (const invalid of [undefined, null, "", "male", 42]) {
        expect(isGenderEligibleFor(invalid, "MEN")).toBe(false);
      }
    });

    it("WOMEN keeps WOMEN + UNISEX and excludes the rest", () => {
      expect(isGenderEligibleFor("WOMEN", "WOMEN")).toBe(true);
      expect(isGenderEligibleFor("UNISEX", "WOMEN")).toBe(true);
      expect(isGenderEligibleFor("MEN", "WOMEN")).toBe(false);
      expect(isGenderEligibleFor(undefined, "WOMEN")).toBe(false);
      expect(isGenderEligibleFor("", "WOMEN")).toBe(false);
    });
  });

  describe("URL tokens", () => {
    it("serialises the compact tokens", () => {
      expect(audienceToUrlToken("MEN")).toBe("men");
      expect(audienceToUrlToken("WOMEN")).toBe("women");
    });

    it("parses tokens leniently (case and surrounding space)", () => {
      expect(parseAudienceToken("men")).toBe("MEN");
      expect(parseAudienceToken(" WOMEN ")).toBe("WOMEN");
      expect(parseAudienceToken("Men")).toBe("MEN");
    });

    it("degrades every malformed value to null instead of throwing", () => {
      for (const malformed of [
        "",
        "   ",
        "male",
        "unisex",
        "men,women",
        "1",
        "<script>",
        undefined,
        null,
      ]) {
        expect(parseAudienceToken(malformed)).toBeNull();
      }
    });
  });
});
