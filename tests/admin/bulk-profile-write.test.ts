import { describe, expect, it } from "vitest";

import {
  computeBulkProfileWrite,
  type DerivedMatchingAxes,
  type ExistingProfileFacts,
} from "@/lib/admin/bulk/helpers";
import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";

/**
 * Pure fill-only merge tests (Phase 12.4 + review fixes).
 *
 * Two guarantees are exercised here without any database or provider:
 *  - legacy all-nine-zero stored axes are treated as repairable missing data,
 *    while any other stored axis value keeps the fill-only "merchant wins" rule;
 *  - automatic enrichment never relabels an existing non-null provenance.
 */

const axes = (value: number): DerivedMatchingAxes =>
  Object.fromEntries(MATCHING_DIMENSIONS.map((axis) => [axis, value])) as unknown as DerivedMatchingAxes;

const fiveAxisNonZero = (): DerivedMatchingAxes =>
  Object.fromEntries(MATCHING_DIMENSIONS.map((axis) => [axis, 70])) as unknown as DerivedMatchingAxes;

const stored = (
  matchingAxes: ExistingProfileFacts["matchingAxes"],
  overrides: Partial<ExistingProfileFacts> = {},
): ExistingProfileFacts => ({
  descriptors: {},
  family: null,
  notes: null,
  matchingAxes,
  ...overrides,
});

describe("computeBulkProfileWrite — legacy all-zero matching axes repair", () => {
  it("treats a profile with ALL NINE axes == 0 as repairable and carries the derived axes", () => {
    const write = computeBulkProfileWrite(stored(axes(0)), {
      descriptors: {},
      matching: fiveAxisNonZero(),
      source: "REFERENCE",
    });

    expect(write.matching).toEqual(fiveAxisNonZero());
  });

  it("preserves valid non-zero stored axes (derivation never overwrites them)", () => {
    const valid = axes(70);

    const write = computeBulkProfileWrite(stored(valid), {
      descriptors: {},
      matching: axes(20),
      source: "AI",
    });

    expect(write.matching).toBeUndefined();
  });

  it("preserves partial/legitimate stored data (fill-only): a single non-zero blocks repair", () => {
    const partial: ExistingProfileFacts["matchingAxes"] = {
      ...axes(0),
      social: 70,
    };

    const write = computeBulkProfileWrite(stored(partial), {
      descriptors: {},
      matching: axes(60),
      source: "AI",
    });

    // Not the all-nine-zero case → stored merchant data still wins.
    expect(write.matching).toBeUndefined();
  });

  it("repaired axes are deterministic: identical inputs produce an identical write", () => {
    const result = { descriptors: {}, matching: axes(55), source: "REFERENCE" as const };

    const a = computeBulkProfileWrite(stored(axes(0)), result);
    const b = computeBulkProfileWrite(stored(axes(0)), result);

    expect(a).toEqual(b);
    expect(a.matching).toEqual(axes(55));
  });

  it("does not invent a matching vector when no derivation was produced", () => {
    const write = computeBulkProfileWrite(stored(axes(0)), {
      descriptors: {},
      source: "AI",
    });

    expect(write.matching).toBeUndefined();
  });
});

describe("computeBulkProfileWrite — provenance is never auto-relabelled", () => {
  it("keeps an existing MANUAL provenance", () => {
    const write = computeBulkProfileWrite(stored(axes(0), { profileSource: "MANUAL" }), {
      descriptors: {},
      matching: axes(60),
      source: "AI",
    });

    expect(write.source).toBe("MANUAL");
  });

  it("keeps an existing REFERENCE provenance", () => {
    const write = computeBulkProfileWrite(stored(axes(0), { profileSource: "REFERENCE" }), {
      descriptors: {},
      matching: axes(60),
      source: "AI",
    });

    expect(write.source).toBe("REFERENCE");
  });

  it("keeps an existing AI provenance", () => {
    const write = computeBulkProfileWrite(stored(axes(0), { profileSource: "AI" }), {
      descriptors: {},
      matching: axes(60),
      source: "REFERENCE",
    });

    expect(write.source).toBe("AI");
  });

  it("stamps MANUAL for a brand-new manual profile", () => {
    const write = computeBulkProfileWrite(stored(null, { profileSource: null }), {
      descriptors: {},
      source: "MANUAL",
    });

    expect(write.source).toBe("MANUAL");
  });

  it("stamps REFERENCE for a brand-new reference-enriched profile", () => {
    const write = computeBulkProfileWrite(stored(null, { profileSource: null }), {
      descriptors: {},
      matching: axes(60),
      source: "REFERENCE",
    });

    expect(write.source).toBe("REFERENCE");
  });

  it("stamps AI for a brand-new AI-fallback profile", () => {
    const write = computeBulkProfileWrite(stored(null, { profileSource: null }), {
      descriptors: {},
      matching: axes(60),
      source: "AI",
    });

    expect(write.source).toBe("AI");
  });
});
