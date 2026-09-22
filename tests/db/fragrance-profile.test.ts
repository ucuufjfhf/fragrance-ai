import { describe, expect, it } from "vitest";

import {
  DESCRIPTOR_DIMENSIONS,
  MATCHING_DIMENSIONS,
  PROFILE_MAX,
  PROFILE_MIN,
  SHARED_DIMENSIONS,
  clampProfileValue,
  isProfileValue,
  isSharedDimension,
  toFragranceProfileView,
  toMatchingVector,
} from "@/lib/fragrance/profile";
import { FRAGRANCE_DIMENSIONS } from "@/types/fragrance";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";

describe("fragrance profile helpers", () => {
  it("defines the 9 matching axes exactly as the personality dimensions", () => {
    expect(MATCHING_DIMENSIONS).toEqual(PERSONALITY_DIMENSIONS);
  });

  it("lists the 5 shared dimensions that overlap with fragrance descriptors", () => {
    expect(SHARED_DIMENSIONS).toEqual([
      "fresh",
      "warm",
      "mysterious",
      "elegant",
      "bold",
    ]);
  });

  it("lists the 10 fragrance-only descriptor dimensions", () => {
    expect(DESCRIPTOR_DIMENSIONS).toEqual([
      "sweet",
      "woody",
      "spicy",
      "floral",
      "citrus",
      "aquatic",
      "smoky",
      "clean",
      "longevity",
      "projection",
    ]);
  });

  it("recognises shared dimensions correctly", () => {
    expect(isSharedDimension("fresh")).toBe(true);
    expect(isSharedDimension("bold")).toBe(true);
    expect(isSharedDimension("woody")).toBe(false);
    expect(isSharedDimension("longevity")).toBe(false);
  });

  it("validates profile values as integers in 0–100", () => {
    expect(isProfileValue(0)).toBe(true);
    expect(isProfileValue(50)).toBe(true);
    expect(isProfileValue(100)).toBe(true);
    expect(isProfileValue(-1)).toBe(false);
    expect(isProfileValue(101)).toBe(false);
    expect(isProfileValue(50.5)).toBe(false);
    expect(isProfileValue("50")).toBe(false);
    expect(isProfileValue(null)).toBe(false);
  });

  it("clamps and rounds values into the 0–100 range", () => {
    expect(clampProfileValue(-5)).toBe(PROFILE_MIN);
    expect(clampProfileValue(150)).toBe(PROFILE_MAX);
    expect(clampProfileValue(42.7)).toBe(43);
    expect(clampProfileValue(42.2)).toBe(42);
    expect(clampProfileValue(null)).toBe(PROFILE_MIN);
    expect(clampProfileValue(undefined)).toBe(PROFILE_MIN);
    expect(clampProfileValue(Number.NaN)).toBe(PROFILE_MIN);
  });

  it("converts a complete matching row to a personality vector", () => {
    const row = {
      social: 10,
      adventurous: 20,
      expressive: 30,
      mysterious: 40,
      fresh: 50,
      warm: 60,
      experimental: 70,
      elegant: 80,
      bold: 90,
    };

    const vector = toMatchingVector(row);

    expect(vector).not.toBeNull();
    expect(vector?.social).toBe(10);
    expect(vector?.bold).toBe(90);
  });

  it("returns null when a matching axis is missing or out of range", () => {
    const incomplete = {
      social: 10,
      adventurous: 20,
      expressive: 30,
      mysterious: 40,
      fresh: 50,
      warm: 60,
      experimental: 70,
      elegant: 80,
      // bold missing
    };

    expect(toMatchingVector(incomplete as never)).toBeNull();

    const outOfRange = {
      social: 10,
      adventurous: 20,
      expressive: 30,
      mysterious: 40,
      fresh: 50,
      warm: 60,
      experimental: 70,
      elegant: 80,
      bold: 999,
    };

    expect(toMatchingVector(outOfRange)).toBeNull();
  });

  it("returns null for missing or non-object rows instead of crashing", () => {
    expect(toMatchingVector(null)).toBeNull();
    expect(toMatchingVector(undefined)).toBeNull();
    expect(toMatchingVector("nope" as never)).toBeNull();
  });

  it("builds the full view with matching axes and descriptors", () => {
    const row = {
      social: 10,
      adventurous: 20,
      expressive: 30,
      mysterious: 40,
      fresh: 50,
      warm: 60,
      experimental: 70,
      elegant: 80,
      bold: 90,
      woody: 85,
      smoky: 75,
      longevity: 88,
      projection: 66,
    };

    const view = toFragranceProfileView(row);

    expect(view.matching.social).toBe(10);
    expect(view.matching.bold).toBe(90);
    expect(view.descriptors.woody).toBe(85);
    expect(view.descriptors.longevity).toBe(88);
    expect(view.descriptors.aquatic).toBe(0); // missing descriptor defaults to 0

    for (const dimension of FRAGRANCE_DIMENSIONS) {
      expect(view.descriptors[dimension]).toBeGreaterThanOrEqual(PROFILE_MIN);
      expect(view.descriptors[dimension]).toBeLessThanOrEqual(PROFILE_MAX);
    }
  });
});
