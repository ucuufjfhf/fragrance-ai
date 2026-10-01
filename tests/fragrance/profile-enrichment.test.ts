import { describe, expect, it, vi } from "vitest";

import {
  enrichPerfumeProfileReferenceFirst,
  neutralMatchingVector,
} from "@/lib/fragrance/profile-enrichment";
import { findReferenceIdentityMatch } from "@/lib/fragrance/reference-enrichment-lookup";
import { normalizePerfumeIdentity } from "@/lib/fragrance/identity";
import { getReferenceCatalogCandidates } from "@/lib/matching/reference-catalog";
import type { AIProvider, AiPerfumeProfileResult } from "@/lib/ai/provider";

/**
 * Deterministic tests for the reference-first enrichment service.
 * The AI provider is always a fake — no network, no secrets, no clock.
 */

/** Records whether the AI was called and returns a fixed valid result. */
function fakeProvider(result?: Partial<AiPerfumeProfileResult>) {
  const calls: unknown[] = [];
  const provider: AIProvider = {
    id: "fake",
    isAvailable: () => true,
    unavailableReason: () => null,
    generatePerfumeProfile: vi.fn(async (input) => {
      calls.push(input);
      return {
        perfumeId: input.perfumeId,
        descriptors: { woody: 70, spicy: 55 },
        family: "woody amber",
        notes: ["عود", "چرم"],
        ...result,
      };
    }),
    generateRecommendationExplanation: vi.fn(async () => {
      throw new Error("should never be called by enrichment");
    }),
  };
  return { provider, calls };
}

/**
 * A curated demo perfume whose display name resolves through the CONSERVATIVE
 * name-based ladder.
 *
 * The curated catalog deliberately contains merchandising display names that
 * CANNOT be resolved by name (22 of 59 — brand "&" tokens, brand-repeated name
 * slugs, "Replica" line prefixes, XJ catalogue codes, year suffixes). Those are
 * pinned to explicit reference slugs instead. This suite exercises the
 * ENRICHMENT lookup, which is name-based, so it needs an entry that round-trips
 * through it — hence an explicit, stable choice rather than "the first entry".
 */
const ROUND_TRIPPING = "Bleu de Chanel Eau de Parfum";

function pickRoundTrippingCandidate() {
  const candidate = getReferenceCatalogCandidates().find(
    (c) => c.name === ROUND_TRIPPING,
  );
  expect(candidate, `curated catalog must contain ${ROUND_TRIPPING}`).toBeDefined();
  return candidate!;
}

describe("reference identity lookup (conservative)", () => {
  it("finds an exact brand+name entry from the bundled catalog", () => {
    const candidate = pickRoundTrippingCandidate();

    const identity = normalizePerfumeIdentity(`${candidate.brand} ${candidate.name}`);
    const brandIdentity = normalizePerfumeIdentity(candidate.brand);

    const lookup = findReferenceIdentityMatch(identity, brandIdentity);
    expect(lookup.ok).toBe(true);
  });

  it("returns NOT_FOUND for a name that does not exist", () => {
    const lookup = findReferenceIdentityMatch(
      normalizePerfumeIdentity("Zzz Nonexistent Fragrance XYZ"),
      normalizePerfumeIdentity("Zzz Brand"),
    );
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) expect(lookup.reason).toBe("NOT_FOUND");
  });

  it("a DIFFERENT variant must not silently match the base entry", () => {
    // Find any catalog entry whose identity is concentration-silent.
    const base = getReferenceCatalogCandidates().find((c) => {
      const id = normalizePerfumeIdentity(`${c.brand} ${c.name}`);
      return !/(edt|edp|edc|extrait|elixir|intense|absolu)/.test(id);
    });
    expect(base).toBeDefined();

    // The same perfume declared as Elixir is a DIFFERENT identity: the exact
    // ladder cannot match it (identity differs), so it must be NOT_FOUND.
    const elixirIdentity = normalizePerfumeIdentity(`${base!.brand} ${base!.name} Elixir`);
    const brandIdentity = normalizePerfumeIdentity(base!.brand);

    const lookup = findReferenceIdentityMatch(elixirIdentity, brandIdentity);
    expect(lookup.ok).toBe(false);
  });

  it("an unknown brand never matches even if a name collides", () => {
    const lookup = findReferenceIdentityMatch(
      normalizePerfumeIdentity("Other Brand Sauvage"),
      normalizePerfumeIdentity("Other Brand"),
    );
    expect(lookup.ok).toBe(false);
  });
});

describe("enrichPerfumeProfileReferenceFirst — reference HIT", () => {
  it("uses the reference profile and NEVER calls the AI", async () => {
    const candidate = pickRoundTrippingCandidate();
    const { provider, calls } = fakeProvider();

    const outcome = await enrichPerfumeProfileReferenceFirst(
      { name: candidate.name, brand: candidate.brand },
      provider,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(calls).toHaveLength(0); // THE core guarantee.
    expect(outcome.profile.provenance).toBe("REFERENCE");
    expect(outcome.profile.matchedIdentity).toBeDefined();
    // All nine axes present and in range.
    for (const axis of Object.values(outcome.profile.matching)) {
      expect(Number.isInteger(axis)).toBe(true);
      expect(axis).toBeGreaterThanOrEqual(0);
      expect(axis).toBeLessThanOrEqual(100);
    }
    expect(Object.keys(outcome.profile.matching)).toHaveLength(9);
  });

  it("is deterministic: two runs produce identical profiles", async () => {
    const candidate = getReferenceCatalogCandidates().find((c) => c.name.length > 3)!;
    const a = await enrichPerfumeProfileReferenceFirst(
      { name: candidate.name, brand: candidate.brand },
      fakeProvider().provider,
    );
    const b = await enrichPerfumeProfileReferenceFirst(
      { name: candidate.name, brand: candidate.brand },
      fakeProvider().provider,
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("enrichPerfumeProfileReferenceFirst — reference MISS → AI fallback", () => {
  it("calls the EXISTING AI provider and derives the nine axes from its structured data", async () => {
    const { provider, calls } = fakeProvider();

    const outcome = await enrichPerfumeProfileReferenceFirst(
      { name: "Zzz Nonexistent Fragrance XYZ", brand: "Zzz Brand" },
      provider,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(calls).toHaveLength(1); // AI was invoked exactly once.
    expect(outcome.profile.provenance).toBe("AI");
    // AI output itself: descriptors only (never axes).
    expect(outcome.profile.descriptors.woody).toBe(70);
    expect(outcome.profile.descriptors.spicy).toBe(55);
    // The nine axes are DETERMINISTICALLY DERIVED from the AI's structured
    // data (woody 70 + spicy 55 + family "woody amber") — never 0/50 fills:
    // warm = (65+70+65+80)/4 = 70, bold = (55+60+55+50)/4 = 55,
    // elegant = (55+55)/2 = 55, mysterious = amber's 45, fresh unmapped = 40,
    // personality-only axes = 40.
    expect(outcome.profile.matching).toEqual({
      social: 40,
      adventurous: 40,
      expressive: 40,
      mysterious: 45,
      fresh: 40,
      warm: 70,
      experimental: 40,
      elegant: 55,
      bold: 55,
    });
  });

  it("fails WITHOUT persisting a profile when the AI data has no usable scent signal", async () => {
    const { provider, calls } = fakeProvider({
      descriptors: { clean: 60, longevity: 50 }, // no shared/scent signal
      family: undefined,
      notes: [],
    });

    const outcome = await enrichPerfumeProfileReferenceFirst(
      { name: "Zzz Nonexistent Fragrance XYZ", brand: "Zzz Brand" },
      provider,
    );

    expect(calls).toHaveLength(1); // the AI ran…
    expect(outcome.ok).toBe(false); // …but enrichment FAILS…
    if (!outcome.ok) {
      expect(outcome.reason).toContain("no usable scent signal");
    }
  });

  it("propagates AI failure without inventing a profile", async () => {
    const provider: AIProvider = {
      id: "fake",
      isAvailable: () => true,
      unavailableReason: () => null,
      generatePerfumeProfile: vi.fn(async () => {
        throw new Error("AI request failed with HTTP 500");
      }),
      generateRecommendationExplanation: vi.fn(async () => {
        throw new Error("not used");
      }),
    };

    const outcome = await enrichPerfumeProfileReferenceFirst(
      { name: "Zzz Nonexistent Fragrance XYZ", brand: "Zzz Brand" },
      provider,
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain("HTTP 500");
  });

  it("an AI result containing a forbidden matching axis is rejected by the existing validator", async () => {
    const { provider } = fakeProvider({
      descriptors: { bold: 90 } as never, // "bold" is a protected axis, not a descriptor
    });

    const outcome = await enrichPerfumeProfileReferenceFirst(
      { name: "Zzz Nonexistent Fragrance XYZ", brand: "Zzz Brand" },
      provider,
    );

    // The existing Phase 4 validator rejects unknown/forbidden keys — the
    // profile must NOT be accepted with an AI-written matching axis.
    expect(outcome.ok).toBe(false);
  });
});

describe("enrichment input guards", () => {
  it("rejects empty name/brand without calling AI", async () => {
    const { provider, calls } = fakeProvider();

    const outcome = await enrichPerfumeProfileReferenceFirst(
      { name: "", brand: "Some Brand" },
      provider,
    );

    expect(outcome.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("neutralMatchingVector is the documented 50 baseline", () => {
    const vector = neutralMatchingVector();
    expect(Object.values(vector)).toHaveLength(9);
    for (const value of Object.values(vector)) expect(value).toBe(50);
  });
});
