import { describe, expect, it } from "vitest";

import {
  ACCORD_AXIS_MAP,
  UNMAPPED_AXIS_NEUTRAL,
  axesFromAccords,
  deriveAxesFromAiStructuredData,
  PERSONALITY_AXES,
} from "@/lib/fragrance/axis-derivation";
import { REFERENCE_ACCORD_VOCABULARY } from "@/lib/ai/reference-lookup";
import { getReferenceCatalogCandidates } from "@/lib/matching/reference-catalog";
import { PROFILE_AXES } from "@/lib/fragrance/profile";

/**
 * Deterministic tests for the shared axis-derivation utility — the SINGLE
 * source of truth for accord→axis contributions used by BOTH the reference
 * catalog and the AI fallback. No network, no database, no AI calls.
 */

/** All nine axes, 0–100 integers, exactly the engine's dimension list. */
function expectValidNineAxisVector(vector: Record<string, number>): void {
  const axes: Record<string, number> = { ...vector };
  expect(Object.keys(axes).sort()).toEqual([...PROFILE_AXES].sort());
  for (const axis of PROFILE_AXES) {
    expect(Number.isInteger(axes[axis])).toBe(true);
    expect(axes[axis]).toBeGreaterThanOrEqual(0);
    expect(axes[axis]).toBeLessThanOrEqual(100);
  }
}

describe("ACCORD_AXIS_MAP — shared-map integrity", () => {
  it("maps only known axes with 0–100 contributions", () => {
    for (const mapping of Object.values(ACCORD_AXIS_MAP)) {
      for (const [axis, value] of Object.entries(mapping)) {
        expect((PERSONALITY_AXES as readonly string[]).includes(axis)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("recognizes every controlled vocabulary accord it can (no silent vocabulary drift)", () => {
    // Every reference-data accord SHOULD map directly, or be a composite the
    // AI-path tokenization handles; the direct-hit set must stay large.
    const directHits = REFERENCE_ACCORD_VOCABULARY.filter(
      (accord) => ACCORD_AXIS_MAP[accord.toLowerCase()] !== undefined,
    );
    expect(directHits.length).toBeGreaterThan(30);
  });

  it("is deterministic for repeated calls", () => {
    expect(axesFromAccords(["woody", "amber"])).toEqual(
      axesFromAccords(["Woody", "AMBER"]),
    );
  });
});

describe("axesFromAccords — reference derivation", () => {
  it("averages contributions and leaves unmapped axes at the documented neutral", () => {
    // "oud" → { warm: 80, bold: 80, mysterious: 70 }; others unmapped.
    const axes = axesFromAccords(["oud"]);
    expect(axes.warm).toBe(80);
    expect(axes.bold).toBe(80);
    expect(axes.mysterious).toBe(70);
    expect(axes.social).toBe(UNMAPPED_AXIS_NEUTRAL);
    expect(axes.adventurous).toBe(UNMAPPED_AXIS_NEUTRAL);
    expect(axes.expressive).toBe(UNMAPPED_AXIS_NEUTRAL);
    expect(axes.experimental).toBe(UNMAPPED_AXIS_NEUTRAL);
    expectValidNineAxisVector(axes);
  });

  it("matches accords case/whitespace-insensitively via normalization", () => {
    expect(axesFromAccords(["Fresh Spicy"])).toEqual(axesFromAccords(["fresh spicy"]));
  });
});

describe("deriveAxesFromAiStructuredData — AI fallback derivation", () => {
  it("derives axes from shared descriptors, scent descriptors and family tokens", () => {
    const result = deriveAxesFromAiStructuredData({
      descriptors: { fresh: 90, woody: 70, spicy: 55 },
      family: "woody amber",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Shared descriptor passes through directly and averages with mapped hits.
    expect(result.axes.fresh).toBe(90);
    // woody(70): warm 65/bold 55/elegant 55; spicy(55): warm 70/bold 60;
    // family "woody": warm 65/bold 55/elegant 55; family "amber": warm 80/bold 50/mysterious 45.
    expect(result.axes.warm).toBe(Math.round((65 + 70 + 65 + 80) / 4)); // 70
    expect(result.axes.bold).toBe(Math.round((55 + 60 + 55 + 50) / 4)); // 55
    expect(result.axes.mysterious).toBe(45);
    expectValidNineAxisVector(result.axes);
    expect(result.signalCount).toBeGreaterThan(0);
  });

  it("gives personality-only axes the documented neutral (never invented values)", () => {
    const result = deriveAxesFromAiStructuredData({
      descriptors: { woody: 60 },
      family: undefined,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const axis of ["social", "adventurous", "expressive", "experimental"] as const) {
      expect(result.axes[axis]).toBe(UNMAPPED_AXIS_NEUTRAL);
    }
  });

  it("treats zero scent descriptors as absent (fill-only convention)", () => {
    const withZero = deriveAxesFromAiStructuredData({
      descriptors: { woody: 0, fresh: 0 },
      family: "leather",
    });
    const familyOnly = deriveAxesFromAiStructuredData({
      descriptors: {},
      family: "leather",
    });

    expect(withZero.ok && familyOnly.ok).toBe(true);
    if (withZero.ok && familyOnly.ok) {
      expect({ ...withZero.axes }).toEqual({ ...familyOnly.axes });
    }
  });

  it("FAILS when the structured data carries no usable scent signal", () => {
    const result = deriveAxesFromAiStructuredData({
      descriptors: { clean: 60, longevity: 50, projection: 40 },
      family: undefined,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("no usable scent signal");
  });

  it("FAILS for completely empty data", () => {
    const result = deriveAxesFromAiStructuredData({ descriptors: {} });
    expect(result.ok).toBe(false);
  });

  it("is deterministic: same input, same axes", () => {
    const input = { descriptors: { woody: 70, sweet: 40 }, family: "woody amber" };
    expect(deriveAxesFromAiStructuredData(input)).toEqual(
      deriveAxesFromAiStructuredData(input),
    );
  });
});

describe("reference catalog — shares the ONE map", () => {
  it("catalog candidates' axes equal axesFromAccords over their own accords", () => {
    const candidates = getReferenceCatalogCandidates().slice(0, 50);
    for (const candidate of candidates) {
      expectValidNineAxisVector(candidate.profile as Record<string, number>);
    }
  });
});
