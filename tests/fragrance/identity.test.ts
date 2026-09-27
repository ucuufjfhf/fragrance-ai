import { describe, expect, it } from "vitest";

import {
  concentrationsCompatible,
  extractConcentrationTokens,
  normalizePerfumeIdentity,
} from "@/lib/fragrance/identity";

/**
 * Pure unit tests for the deterministic identity normalization layer.
 * No DB, no network, no AI — the module is dependency-free by design.
 */
describe("normalizePerfumeIdentity", () => {
  it("collapses casing and whitespace differences", () => {
    expect(normalizePerfumeIdentity("Dior Sauvage")).toBe(
      normalizePerfumeIdentity("  DIOR   sauvage "),
    );
    expect(normalizePerfumeIdentity("Bleu\tde\nChanel")).toBe("bleu de chanel");
  });

  it("strips harmless punctuation and separator noise", () => {
    expect(normalizePerfumeIdentity("L'Homme, YSL!")).toBe(normalizePerfumeIdentity("L Homme YSL"));
    expect(normalizePerfumeIdentity("La-Vie-Est-Belle")).toBe("la vie est belle");
    expect(normalizePerfumeIdentity("N°5...")).toBe(normalizePerfumeIdentity("n 5"));
  });

  it("normalizes ampersand spacing consistently", () => {
    // "&" becomes the word "and" so "D&G" and "D G" normalize identically.
    expect(normalizePerfumeIdentity("D&G Light Blue")).toBe(
      normalizePerfumeIdentity("D and G Light Blue"),
    );
    expect(normalizePerfumeIdentity("D&G Light Blue")).toContain("and");
  });

  it("strips diacritics (NFKD)", () => {
    expect(normalizePerfumeIdentity("Crème de Cuir")).toBe(normalizePerfumeIdentity("Creme de Cuir"));
    expect(normalizePerfumeIdentity("Hérisson")).toBe(normalizePerfumeIdentity("Herisson"));
  });

  it("PRESERVES variant tokens: EDT/EDP/Parfum/Extrait normalize to distinct canonical forms", () => {
    const edt = normalizePerfumeIdentity("Sauvage Eau de Toilette");
    const edp = normalizePerfumeIdentity("Sauvage Eau de Parfum");
    const elixir = normalizePerfumeIdentity("Sauvage Elixir");
    const extrait = normalizePerfumeIdentity("Sauvage Extrait de Parfum");

    // All four are DIFFERENT identities.
    expect(new Set([edt, edp, elixir, extrait]).size).toBe(4);
    // Canonical short forms collapse alias spellings.
    expect(edt).toBe(normalizePerfumeIdentity("Sauvage EDT"));
    expect(edp).toBe(normalizePerfumeIdentity("Sauvage EDP"));
    expect(extrait).toBe(normalizePerfumeIdentity("Sauvage Extrait"));
    // "Parfum" alone is deliberately NOT a concentration alias (it is a
    // flanker word, e.g. "Le Parfum"), so it survives normalization as-is.
    expect(normalizePerfumeIdentity("Sauvage Parfum")).not.toBe(edp);
  });

  it("preserves flanker and intensity words", () => {
    expect(normalizePerfumeIdentity("Sauvage Intense")).not.toBe(
      normalizePerfumeIdentity("Sauvage"),
    );
    expect(normalizePerfumeIdentity("La Vie Est Belle Absolu")).not.toBe(
      normalizePerfumeIdentity("La Vie Est Belle"),
    );
    // "Le Parfum" as a flanker NAME is preserved distinctly from plain "parfum".
    expect(normalizePerfumeIdentity("5th Avenue Le Parfum")).toContain("le-parfum");
  });

  it("preserves gender words (meaningful identification)", () => {
    expect(normalizePerfumeIdentity("J'adore")).not.toBe(normalizePerfumeIdentity("J'adore Homme"));
  });
});

describe("extractConcentrationTokens", () => {
  it("returns canonical short forms", () => {
    expect(extractConcentrationTokens(normalizePerfumeIdentity("Sauvage Eau de Toilette"))).toEqual([
      "edt",
    ]);
    expect(extractConcentrationTokens(normalizePerfumeIdentity("Sauvage EDP"))).toEqual(["edp"]);
    expect(extractConcentrationTokens(normalizePerfumeIdentity("Sauvage Elixir"))).toEqual([
      "elixir",
    ]);
  });

  it("returns empty for concentration-free names", () => {
    expect(extractConcentrationTokens(normalizePerfumeIdentity("Bleu de Chanel"))).toEqual([]);
  });

  it("keeps multiple tokens when several appear", () => {
    // "Eau de Parfum Intense" carries both tokens.
    expect(
      extractConcentrationTokens(normalizePerfumeIdentity("Bleu Eau de Parfum Intense")),
    ).toEqual(["edp", "intense"]);
  });
});

describe("concentrationsCompatible", () => {
  it("bare name vs explicit EDT is compatible (merchant listing convention)", () => {
    expect(concentrationsCompatible(normalizePerfumeIdentity("Sauvage"), normalizePerfumeIdentity("Sauvage EDT"))).toBe(
      true,
    );
  });

  it("bare name vs Elixir is NOT compatible (different variant)", () => {
    expect(concentrationsCompatible(normalizePerfumeIdentity("Sauvage"), normalizePerfumeIdentity("Sauvage Elixir"))).toBe(
      false,
    );
  });

  it("EDT vs EDP is NOT compatible", () => {
    expect(
      concentrationsCompatible(
        normalizePerfumeIdentity("Sauvage EDT"),
        normalizePerfumeIdentity("Sauvage EDP"),
      ),
    ).toBe(false);
  });

  it("identical concentrations are compatible", () => {
    expect(
      concentrationsCompatible(
        normalizePerfumeIdentity("Sauvage EDP"),
        normalizePerfumeIdentity("Sauvage Eau de Parfum"),
      ),
    ).toBe(true);
  });

  it("both silent is compatible", () => {
    expect(concentrationsCompatible(normalizePerfumeIdentity("Bleu"), normalizePerfumeIdentity("Bleu"))).toBe(true);
  });
});
