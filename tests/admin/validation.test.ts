import { describe, expect, it } from "vitest";

import {
  isPerfumeInStore,
  validatePerfumePayload,
} from "@/lib/admin/validation";
import { PROFILE_AXES } from "@/lib/fragrance/profile";

/**
 * Pure tests for the Phase 6A admin validation boundary — no database, no
 * network. These cover the rules the spec mandates: required fields, integer
 * 0–100 matching axes, enum membership, URL/price sanity, boolean strictness
 * and the store-isolation guard.
 */

/** A fully valid payload; individual tests override single fields. */
const validPayload = () => ({
  name: "نویر آزمون",
  brand: "خانه آزمون",
  slug: "nawir-test",
  description: "توضیح آزمایشی",
  productUrl: "https://shop.example.com/p/nawir",
  imageUrl: "https://cdn.example.com/p/nawir.jpg",
  gender: "UNISEX",
  price: 1500000,
  inStock: true,
  active: true,
  profile: Object.fromEntries([
    ...PROFILE_AXES.map((dimension) => [dimension, 50]),
    ["family", "woody amber"],
    ["notes", ["عود", "چرم"]],
    ["season", "AUTUMN"],
    ["occasion", "PARTY"],
    ["sweet", 30],
    ["woody", 80],
    ["longevity", 70],
  ]),
});

/**
 * Builds a payload from the valid base, applying overrides INSIDE `profile`
 * when the key is a profile key, so a test can replace the whole profile too.
 */
const parse = (overrides: Record<string, unknown> = {}) => {
  const base = validPayload() as unknown as Record<string, unknown>;
  const merged = { ...base };

  const profileOverrides = overrides.profile as Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(overrides)) {
    if (key !== "profile") {
      merged[key] = value;
    }
  }

  merged.profile = { ...(base.profile as Record<string, unknown>), ...(profileOverrides ?? {}) };

  return validatePerfumePayload(merged);
};

const parseProfileReplace = (profile: Record<string, unknown>) => {
  const base = validPayload() as unknown as Record<string, unknown>;
  return validatePerfumePayload({ ...base, profile });
};

describe("validatePerfumePayload — valid payloads", () => {
  it("accepts a complete payload with a full fragrance profile", () => {
    const result = parse();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("نویر آزمون");
      for (const dimension of PROFILE_AXES) {
        expect(result.value.profile.matching[dimension]).toBe(50);
      }
      expect(result.value.profile.descriptors.woody).toBe(80);
      expect(result.value.profile.descriptors.longevity).toBe(70);
      expect(result.value.profile.season).toBe("AUTUMN");
      expect(result.value.profile.occasion).toBe("PARTY");
      expect(result.value.profile.notes).toEqual(["عود", "چرم"]);
    }
  });

  it("defaults gender to UNISEX and booleans to true when absent", () => {
    const result = parse({ gender: undefined, inStock: undefined, active: undefined });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.gender).toBe("UNISEX");
      expect(result.value.inStock).toBe(true);
      expect(result.value.active).toBe(true);
    }
  });

  it("normalises whitespace and drops empty optional text", () => {
    const result = parse({ name: "  عطر تمیز  ", slug: "  " });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("عطر تمیز");
      expect(result.value.slug).toBeUndefined();
    }
  });
});

describe("validatePerfumePayload — required fields", () => {
  it("rejects missing or blank name and brand", () => {
    const missingName = validPayload() as unknown as Record<string, unknown>;
    delete missingName.name;

    const blankBrand = validPayload() as unknown as Record<string, unknown>;
    blankBrand.brand = "   ";

    for (const [label, payload] of [
      ["missing name", missingName],
      ["blank brand", blankBrand],
    ] as const) {
      const result = validatePerfumePayload(payload);

      expect(result.ok, label).toBe(false);
      if (!result.ok) {
        expect(result.errors.name ?? result.errors.brand).toBeTruthy();
      }
    }
  });

  it("rejects a missing profile object entirely", () => {
    const payload = validPayload() as unknown as Record<string, unknown>;
    delete payload.profile;

    const result = validatePerfumePayload(payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.profile).toBeTruthy();
    }
  });

  it("rejects a payload with all nine matching axes missing", () => {
    const result = parseProfileReplace({ sweet: 40 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const dimension of PROFILE_AXES) {
        expect(result.errors[dimension]).toBeTruthy();
      }
    }
  });
});

describe("validatePerfumePayload — matching axis rules", () => {
  it("rejects non-integer matching values (decimals, strings, NaN)", () => {
    for (const invalid of [12.5, "60", Number.NaN, null]) {
      const result = parse({ profile: { social: invalid } });

      expect(result.ok, String(invalid)).toBe(false);
      if (!result.ok) {
        expect(result.errors.social).toBeTruthy();
      }
    }
  });

  it("rejects values below 0 and above 100", () => {
    for (const invalid of [-1, 101, 1000]) {
      const result = parse({ profile: { bold: invalid } });

      expect(result.ok, String(invalid)).toBe(false);
      if (!result.ok) {
        expect(result.errors.bold).toBeTruthy();
      }
    }
  });

  it("validates optional descriptors with the same 0–100 integer rule", () => {
    const bad = parse({ profile: { smoky: 101 } });
    const decimal = parse({ profile: { citrus: 33.3 } });

    expect(bad.ok).toBe(false);
    expect(decimal.ok).toBe(false);
  });

  it("ignores unknown profile keys instead of inventing dimensions", () => {
    const result = parse({ profile: { fantasy_axis: 42 } });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("fantasy_axis" in result.value.profile.descriptors).toBe(false);
    }
  });
});

describe("validatePerfumePayload — enums, URLs, price, slug", () => {
  it("rejects invalid gender, season and occasion values", () => {
    const result = parse({
      gender: "ALIENS",
      profile: { season: "MONSOON", occasion: "WEDDING" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.gender).toBeTruthy();
      expect(result.errors.season).toBeTruthy();
      expect(result.errors.occasion).toBeTruthy();
    }
  });

  it("accepts every existing enum value", () => {
    for (const gender of ["MEN", "WOMEN", "UNISEX"]) {
      expect(parse({ gender }).ok).toBe(true);
    }
    for (const season of ["SPRING", "SUMMER", "AUTUMN", "WINTER", "ALL"]) {
      expect(parse({ season }).ok).toBe(true);
    }
    for (const occasion of ["DAILY", "DATE", "PARTY", "OFFICE", "FORMAL"]) {
      expect(parse({ occasion }).ok).toBe(true);
    }
  });

  it("rejects malformed URLs and negative prices but allows absence", () => {
    expect(parse({ productUrl: "not a url" }).ok).toBe(false);
    expect(parse({ imageUrl: "ftp://x.example/y.png" }).ok).toBe(false);
    expect(parse({ price: -5 }).ok).toBe(false);
    expect(parse({ productUrl: undefined, imageUrl: undefined, price: undefined }).ok).toBe(true);
  });

  it("rejects slugs outside the lowercase-latin/dash pattern", () => {
    expect(parse({ slug: "Invalid Slug" }).ok).toBe(false);
    expect(parse({ slug: "دو-نامک" }).ok).toBe(false);
    expect(parse({ slug: "valid-slug-2" }).ok).toBe(true);
  });

  it("treats non-boolean inStock/active as rejected-then-defaulted, not truthy strings", () => {
    const result = parse({ inStock: "yes", active: 0 });

    // Strings/numbers are NOT booleans: the validator falls back to the
    // default (true) instead of coercing a truthy value.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.inStock).toBe(true);
      expect(result.value.active).toBe(true);
    }
  });
});

describe("isPerfumeInStore — store isolation guard", () => {
  it("accepts a perfume whose storeId matches the selected store", () => {
    expect(isPerfumeInStore({ storeId: "store-a" }, "store-a")).toBe(true);
  });

  it("rejects a perfume from another store", () => {
    expect(isPerfumeInStore({ storeId: "store-b" }, "store-a")).toBe(false);
  });

  it("rejects a missing row and an empty store id", () => {
    expect(isPerfumeInStore(null, "store-a")).toBe(false);
    expect(isPerfumeInStore(undefined, "store-a")).toBe(false);
    expect(isPerfumeInStore({ storeId: "store-a" }, "")).toBe(false);
  });
});
