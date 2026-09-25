import { describe, expect, it } from "vitest";

import {
  REFERENCE_ACCORD_VOCABULARY,
  findReferenceMatch,
  normalizeFragranceText,
} from "@/lib/ai/reference-lookup";

describe("normalizeFragranceText", () => {
  it("folds slugified dataset names and display names onto one form", () => {
    expect(normalizeFragranceText("le-male-le-parfum")).toBe(
      normalizeFragranceText("Le Male Le Parfum"),
    );
  });

  it("is case-insensitive and strips diacritics", () => {
    expect(normalizeFragranceText("L'Eau d'Issey")).toBe("l eau d issey");
    expect(normalizeFragranceText("Café-Café")).toBe(normalizeFragranceText("cafe cafe"));
  });

  it("normalises ampersands to and", () => {
    expect(normalizeFragranceText("Bath & Body")).toBe(
      normalizeFragranceText("bath and body"),
    );
  });
});

describe("findReferenceMatch", () => {
  it("finds an exact dataset perfume by slugified name and brand", () => {
    const match = findReferenceMatch("Sauvage", "Dior");

    expect(match).not.toBeNull();
    expect(match?.exact).toBe(true);
    expect(normalizeFragranceText(match!.entry.n)).toBe("sauvage");
    expect(normalizeFragranceText(match!.entry.b)).toBe("dior");
    expect(match!.entry.a.length).toBeGreaterThan(0);
    expect(match!.entry.t.length).toBeGreaterThan(0);
  });

  it("matches display names with punctuation/case differences", () => {
    const match = findReferenceMatch("La Vie Est Belle", "Lancome");

    expect(match).not.toBeNull();
    expect(match?.exact).toBe(true);
  });

  it("fuzzy-matches a near name with the same brand", () => {
    // Real dataset entry: le-male-le-parfum (Jean Paul Gaultier).
    const match = findReferenceMatch("Le Male Parfum", "Jean Paul Gaultier");

    expect(match).not.toBeNull();
    expect(match?.exact).toBe(false);
    expect(normalizeFragranceText(match!.entry.n)).toContain("le male");
  });

  it("falls back to a name-only exact match when the brand is unknown", () => {
    const match = findReferenceMatch("Sauvage", "Brand Not In Dataset");

    expect(match).not.toBeNull();
    expect(match?.exact).toBe(true);
    expect(normalizeFragranceText(match!.entry.n)).toBe("sauvage");
  });

  it("returns null for unrelated names", () => {
    expect(findReferenceMatch("نویر آزمون", "خانه آزمون")).toBeNull();
    expect(findReferenceMatch("zzqx-nonexistent-perfume", "zzqx-brand")).toBeNull();
  });

  it("returns null for empty inputs", () => {
    expect(findReferenceMatch("", "Dior")).toBeNull();
    expect(findReferenceMatch("Sauvage", "")).toBeNull();
    expect(findReferenceMatch("", "")).toBeNull();
  });

  it("prefers entries whose brand also matches over name-only matches", () => {
    const match = findReferenceMatch("Bleu de Chanel", "Chanel");

    expect(match).not.toBeNull();
    expect(normalizeFragranceText(match!.entry.b)).toBe("chanel");
  });
});

describe("REFERENCE_ACCORD_VOCABULARY", () => {
  it("is a non-empty sorted list of lowercase accord labels", () => {
    expect(REFERENCE_ACCORD_VOCABULARY.length).toBeGreaterThanOrEqual(80);

    const sorted = [...REFERENCE_ACCORD_VOCABULARY].sort();
    expect(REFERENCE_ACCORD_VOCABULARY).toEqual(sorted);

    for (const label of REFERENCE_ACCORD_VOCABULARY) {
      expect(label).toBe(label.toLowerCase());
      expect(label.length).toBeGreaterThan(0);
    }

    // Cornerstones of the descriptor mapping exist in the vocabulary.
    for (const expected of ["woody", "citrus", "sweet", "floral", "warm spicy"]) {
      expect(REFERENCE_ACCORD_VOCABULARY).toContain(expected);
    }
  });
});
