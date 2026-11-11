import { describe, expect, it } from "vitest";

import {
  isValidStoreId,
  validateWidgetVector,
  type WidgetRecommendation,
} from "@/lib/widget/contract";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";

/**
 * Pure tests for the Phase 8 widget contract — no DB, no DOM.
 */

describe("isValidStoreId — embed configuration validation (§9/§10)", () => {
  it("accepts well-formed opaque store ids", () => {
    expect(isValidStoreId("store-demo-perfume-shop")).toBe(true);
    expect(isValidStoreId("abc123")).toBe(true);
    expect(isValidStoreId("store_1")).toBe(true);
  });

  it("rejects missing, empty and non-string values", () => {
    expect(isValidStoreId(undefined)).toBe(false);
    expect(isValidStoreId(null)).toBe(false);
    expect(isValidStoreId("")).toBe(false);
    expect(isValidStoreId(42)).toBe(false);
  });

  it("rejects malformed ids (spaces, injection attempts, overlong)", () => {
    expect(isValidStoreId("store A")).toBe(false);
    expect(isValidStoreId("'; DROP TABLE store;--")).toBe(false);
    expect(isValidStoreId("../../etc/passwd")).toBe(false);
    expect(isValidStoreId("x".repeat(65))).toBe(false);
  });
});

describe("validateWidgetVector — strict vector contract (§13)", () => {
  const makeVector = (value = 50): Record<string, number> =>
    Object.fromEntries(PERSONALITY_DIMENSIONS.map((dimension) => [dimension, value]));

  it("accepts a complete valid vector", () => {
    const result = validateWidgetVector(makeVector());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.vector.social).toBe(50);
    }
  });

  it("rejects a non-object vector", () => {
    expect(validateWidgetVector(null).ok).toBe(false);
    expect(validateWidgetVector("vector").ok).toBe(false);
    expect(validateWidgetVector([1, 2, 3]).ok).toBe(false);
  });

  it("rejects a missing axis — all nine are required", () => {
    const incomplete = makeVector();

    delete incomplete.bold;
    const result = validateWidgetVector(incomplete);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toContain("bold");
    }
  });

  it("rejects out-of-range, decimal and non-numeric values", () => {
    expect(validateWidgetVector(makeVector(-1)).ok).toBe(false);
    expect(validateWidgetVector(makeVector(101)).ok).toBe(false);
    expect(validateWidgetVector({ ...makeVector(), fresh: 50.5 }).ok).toBe(false);
    expect(validateWidgetVector({ ...makeVector(), fresh: "50" }).ok).toBe(false);
  });

  it("accepts the boundary values 0 and 100", () => {
    const result = validateWidgetVector({ ...makeVector(0), bold: 100 });

    expect(result.ok).toBe(true);
  });
});

describe("WidgetRecommendation — additive five-axis pass-through (batch 40)", () => {
  const base = {
    perfumeId: "p-1",
    rank: 1,
    name: "عطر یک",
    brand: "برند یک",
    productUrl: "https://shop.example/p/1",
    imageUrl: null,
    price: null,
    matchPercent: 88.4,
  };

  it("keeps the existing payload valid without the new field", () => {
    const recommendation: WidgetRecommendation = base;

    expect(recommendation.matchingProfile).toBeUndefined();
    expect(Object.keys(recommendation).sort()).toEqual([
      "brand", "imageUrl", "matchPercent", "name", "perfumeId", "price", "productUrl", "rank",
    ]);
  });

  it("carries the five matching values verbatim when present", () => {
    const recommendation: WidgetRecommendation = {
      ...base,
      matchingProfile: { fresh: 90, warm: 10, mysterious: 40, elegant: 60, bold: 20 },
    };

    expect(recommendation.matchingProfile).toEqual({
      fresh: 90,
      warm: 10,
      mysterious: 40,
      elegant: 60,
      bold: 20,
    });
    // Display only: the contract still has exactly one score field.
    expect(recommendation.matchPercent).toBe(88.4);
  });
});
