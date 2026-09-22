import { describe, expect, it } from "vitest";

import {
  DEFAULT_RESULTS_STORE_ID,
  parseResultsParams,
  serializeResultsParams,
} from "@/lib/results/params";
import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import type { PersonalityVector } from "@/types/personality";

/** Flat 50 vector; helper keeps the tests readable. */
const makeVector = (value = 50): PersonalityVector =>
  Object.fromEntries(
    MATCHING_DIMENSIONS.map((dimension) => [dimension, value]),
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
});

describe("parseResultsParams", () => {
  it("rejects missing params, missing values and unknown archetypes", () => {
    expect(parseResultsParams(undefined).ok).toBe(false);

    const empty = parseResultsParams({});
    expect(empty.ok).toBe(false);

    const badArchetype = parseResultsParams({
      ...Object.fromEntries(
        MATCHING_DIMENSIONS.map((d) => [`v_${d}`, "50"]),
      ),
      archetype: "no-such-archetype",
    });
    expect(badArchetype.ok).toBe(false);
  });

  it("rejects out-of-range and non-integer vector values", () => {
    const base = Object.fromEntries(
      MATCHING_DIMENSIONS.map((d) => [`v_${d}`, "50"]),
    ) as Record<string, string>;

    for (const invalid of ["101", "-1", "12.5", "abc", ""]) {
      const parsed = parseResultsParams({ ...base, v_bold: invalid });

      expect(parsed.ok, `v_bold=${invalid}`).toBe(false);
    }
  });

  it("rejects an incomplete vector instead of substituting values", () => {
    const partial = Object.fromEntries(
      MATCHING_DIMENSIONS.slice(0, 8).map((d) => [`v_${d}`, "50"]),
    );

    const parsed = parseResultsParams({ ...partial, archetype: "romantic" });

    expect(parsed.ok).toBe(false);
  });

  it("falls back to the demo store when store is absent or empty", () => {
    const base = Object.fromEntries(
      MATCHING_DIMENSIONS.map((d) => [`v_${d}`, "50"]),
    );
    const withEmpty = parseResultsParams({ ...base, archetype: "romantic", store: "" });

    expect(withEmpty.ok).toBe(true);
    if (withEmpty.ok) {
      expect(withEmpty.value.storeId).toBe(DEFAULT_RESULTS_STORE_ID);
    }
  });
});
