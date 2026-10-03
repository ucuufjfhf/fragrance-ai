import { describe, expect, it } from "vitest";

import {
  DEFAULT_RESULTS_STORE_ID,
  parseResultsParams,
  serializeResultsParams,
} from "@/lib/results/params";
import { PROFILE_AXES } from "@/lib/fragrance/profile";
import type { PersonalityVector } from "@/types/personality";

/** Flat 50 vector; helper keeps the tests readable. */
const makeVector = (value = 50): PersonalityVector =>
  Object.fromEntries(
    PROFILE_AXES.map((dimension) => [dimension, value]),
  ) as PersonalityVector;

describe("serializeResultsParams", () => {
  it("round-trips a vector and archetype id through the URL", () => {
    const vector = makeVector(50);
    vector.bold = 87;
    vector.fresh = 3;

    const query = serializeResultsParams(vector, "mysterious-explorer");
    const parsed = parseResultsParams(
      Object.fromEntries(new URLSearchParams(query).entries()),
    );

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.vector).toEqual(vector);
      expect(parsed.value.archetype.id).toBe("mysterious-explorer");
      expect(parsed.value.storeId).toBe(DEFAULT_RESULTS_STORE_ID);
    }
  });

  it("emits exactly nine vector values, an archetype and no store by default", () => {
    const query = serializeResultsParams(makeVector(), "bold-one");

    expect(query).toContain("archetype=bold-one");
    expect(query).not.toContain("store=");
    expect(query.split("&").filter((part) => part.startsWith("v_"))).toHaveLength(9);
  });

  it("carries a non-default store id", () => {
    const query = serializeResultsParams(makeVector(), "romantic", "store-other");
    const parsed = parseResultsParams(
      Object.fromEntries(new URLSearchParams(query).entries()),
    );

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.storeId).toBe("store-other");
    }
  });

  it("omits the default REFERENCE_CATALOG source (demo URLs stay short)", () => {
    const query = serializeResultsParams(makeVector(), "romantic", undefined, "REFERENCE_CATALOG");

    expect(query).not.toContain("source=");

    const parsed = parseResultsParams(
      Object.fromEntries(new URLSearchParams(query).entries()),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.source).toBe("REFERENCE_CATALOG");
    }
  });

  it("serializes an explicit MERCHANT_INVENTORY source and round-trips it", () => {
    const query = serializeResultsParams(
      makeVector(),
      "romantic",
      "store-other",
      "MERCHANT_INVENTORY",
    );

    expect(query).toContain("source=MERCHANT_INVENTORY");

    const parsed = parseResultsParams(
      Object.fromEntries(new URLSearchParams(query).entries()),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.source).toBe("MERCHANT_INVENTORY");
    }
  });

  it("an explicit source survives even when it contradicts store presence", () => {
    // Storeless URL pinned to MERCHANT_INVENTORY: the explicit param wins.
    const query = serializeResultsParams(makeVector(), "romantic", undefined, "MERCHANT_INVENTORY");
    expect(query).toContain("source=MERCHANT_INVENTORY");

    const parsed = parseResultsParams(
      Object.fromEntries(new URLSearchParams(query).entries()),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.source).toBe("MERCHANT_INVENTORY");
    }
  });

  it("omits source for a store URL, whose store-aware default is MERCHANT_INVENTORY", () => {
    // No explicit source is emitted, but parsing a store-bearing URL defaults
    // to merchant inventory (store-presence aware default).
    const query = serializeResultsParams(makeVector(), "romantic", "store-other");
    expect(query).not.toContain("source=");

    const parsed = parseResultsParams(
      Object.fromEntries(new URLSearchParams(query).entries()),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.source).toBe("MERCHANT_INVENTORY");
    }
  });
});

describe("parseResultsParams", () => {
  it("rejects missing params, missing values and unknown archetypes", () => {
    expect(parseResultsParams(undefined).ok).toBe(false);

    const empty = parseResultsParams({});
    expect(empty.ok).toBe(false);

    const badArchetype = parseResultsParams({
      ...Object.fromEntries(
        PROFILE_AXES.map((d) => [`v_${d}`, "50"]),
      ),
      archetype: "no-such-archetype",
    });
    expect(badArchetype.ok).toBe(false);
  });

  it("rejects out-of-range and non-integer vector values", () => {
    const base = Object.fromEntries(
      PROFILE_AXES.map((d) => [`v_${d}`, "50"]),
    ) as Record<string, string>;

    for (const invalid of ["101", "-1", "12.5", "abc", ""]) {
      const parsed = parseResultsParams({ ...base, v_bold: invalid });

      expect(parsed.ok, `v_bold=${invalid}`).toBe(false);
    }
  });

  it("rejects an incomplete vector instead of substituting values", () => {
    const partial = Object.fromEntries(
      PROFILE_AXES.slice(0, 8).map((d) => [`v_${d}`, "50"]),
    );

    const parsed = parseResultsParams({ ...partial, archetype: "romantic" });

    expect(parsed.ok).toBe(false);
  });

  it("falls back to the demo store when store is absent or empty", () => {
    const base = Object.fromEntries(
      PROFILE_AXES.map((d) => [`v_${d}`, "50"]),
    );
    const withEmpty = parseResultsParams({ ...base, archetype: "romantic", store: "" });

    expect(withEmpty.ok).toBe(true);
    if (withEmpty.ok) {
      expect(withEmpty.value.storeId).toBe(DEFAULT_RESULTS_STORE_ID);
    }
  });

  it("defaults the source to REFERENCE_CATALOG when no store context exists", () => {
    const base = Object.fromEntries(
      PROFILE_AXES.map((d) => [`v_${d}`, "50"]),
    );

    const parsed = parseResultsParams({ ...base, archetype: "romantic" });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.source).toBe("REFERENCE_CATALOG");
    }
  });

  it("defaults the source to MERCHANT_INVENTORY when a store context exists", () => {
    const base = Object.fromEntries(
      PROFILE_AXES.map((d) => [`v_${d}`, "50"]),
    );

    const parsed = parseResultsParams({ ...base, archetype: "romantic", store: "store-real-merchant" });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.source).toBe("MERCHANT_INVENTORY");
    }
  });

  it("an explicit source param wins over the store-presence default", () => {
    const base = Object.fromEntries(
      PROFILE_AXES.map((d) => [`v_${d}`, "50"]),
    );

    const pinnedDemo = parseResultsParams({
      ...base,
      archetype: "romantic",
      store: "store-real-merchant",
      source: "REFERENCE_CATALOG",
    });
    expect(pinnedDemo.ok).toBe(true);
    if (pinnedDemo.ok) {
      expect(pinnedDemo.value.source).toBe("REFERENCE_CATALOG");
    }
  });

  it("an unknown source value falls back to the store-presence default", () => {
    const base = Object.fromEntries(
      PROFILE_AXES.map((d) => [`v_${d}`, "50"]),
    );

    const bogus = parseResultsParams({ ...base, archetype: "romantic", source: "SOMETHING_ELSE" });
    expect(bogus.ok).toBe(true);
    if (bogus.ok) {
      expect(bogus.value.source).toBe("REFERENCE_CATALOG");
    }
  });
});
