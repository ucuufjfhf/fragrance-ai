import { describe, expect, it } from "vitest";

import {
  isValidStoreId,
  validateWidgetVector,
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
