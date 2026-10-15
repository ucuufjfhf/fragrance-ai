import { describe, expect, it } from "vitest";

import {
  BOTTLE_ARTWORK,
  DEFAULT_BOTTLE,
  artworkForAccords,
  bottleForAccords,
} from "@/lib/perfumes/artwork";
import { getCuratedDemoPerfumes } from "@/lib/matching/curated-catalog";

describe("bottleForAccords — scent-character mapping", () => {
  it("maps each character's signature accords to its bottle", () => {
    expect(bottleForAccords(["vanilla", "sweet"])).toBe("terracotta");
    expect(bottleForAccords(["tobacco", "warm spicy"])).toBe("wine");
    expect(bottleForAccords(["citrus", "marine"])).toBe("champagne");
    expect(bottleForAccords(["amber", "balsamic"])).toBe("amber-apothecary");
    expect(bottleForAccords(["rose", "white floral"])).toBe("rose-gold");
    expect(bottleForAccords(["smoky", "leather"])).toBe("oud");
  });

  it("is case-insensitive and skips unknown accords without guessing", () => {
    expect(bottleForAccords(["Vanilla", "CINNAMON"])).toBe("terracotta");
    expect(bottleForAccords(["Smoky"])).toBe("oud");
  });

  it("falls back to the house default with no recognisable signal", () => {
    expect(bottleForAccords([])).toBe(DEFAULT_BOTTLE);
    expect(bottleForAccords(undefined)).toBe(DEFAULT_BOTTLE);
    expect(bottleForAccords(null)).toBe(DEFAULT_BOTTLE);
    expect(bottleForAccords(["cinnamon", "alcohol"])).toBe(DEFAULT_BOTTLE);
  });

  it("resolves every curated demo perfume, covering all six bottles", () => {
    const seen = new Set(
      getCuratedDemoPerfumes().map((perfume) =>
        bottleForAccords(perfume.accords),
      ),
    );
    expect(seen).toEqual(
      new Set([
        "terracotta",
        "wine",
        "champagne",
        "amber-apothecary",
        "rose-gold",
        "oud",
      ]),
    );
  });

  it("serves the 16:10 webp bottle files, one per character", () => {
    for (const [bottle, path] of Object.entries(BOTTLE_ARTWORK)) {
      expect(path).toBe(`/perfumes/bottles/bottle-${bottle}.webp`);
    }
    expect(artworkForAccords(["oud"])).toBe(
      "/perfumes/bottles/bottle-oud.webp",
    );
  });
});
