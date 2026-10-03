import { describe, expect, it } from "vitest";

import { MAX_DISTANCE, toPresentationScore } from "@/lib/matching/score";
import {
  DEFAULT_TOP_N,
  matchPerfumes,
  resolveTopN,
  validatePersonalityVector,
} from "@/lib/matching/engine";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { PersonalityVector } from "@/types/personality";
import type { MatchCandidateInput } from "@/types/recommendation";

/** A flat vector: every dimension set to `value`. */
const flat = (value: number): PersonalityVector =>
  Object.fromEntries(
    PERSONALITY_DIMENSIONS.map((dimension) => [dimension, value]),
  ) as PersonalityVector;

/** Same profile as `flat`, but with one axis moved by `offset`. */
const offsetProfile = (base: number, dimension: string, offset: number) => ({
  ...flat(base),
  [dimension]: base + offset,
});

const candidate = (
  perfumeId: string,
  profile?: MatchCandidateInput["profile"],
  overrides: Partial<MatchCandidateInput> = {},
): MatchCandidateInput => ({
  perfumeId,
  storeId: "store-a",
  name: `Perfume ${perfumeId}`,
  brand: "Demo Maison",
  slug: perfumeId,
  productUrl: `https://demo.example.com/p/${perfumeId}`,
  imageUrl: null,
  inStock: true,
  active: true,
  profile,
  ...overrides,
});

describe("matching formula", () => {
  it("uses the documented 5D maximum distance sqrt(5 x 100^2)", () => {
    expect(MAX_DISTANCE).toBeCloseTo(Math.sqrt(5) * 100, 10);
    expect(MAX_DISTANCE).toBeCloseTo(223.60679774997897, 10);
  });

  it("scores an exact match as 100 with distance 0", () => {
    const result = matchPerfumes({
      personalityVector: flat(50),
      perfumes: [candidate("p-exact", flat(50))],
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].distance).toBe(0);
    expect(result.recommendations[0].score).toBe(100);
    expect(result.recommendations[0].presentationScore).toBe(100);
    expect(result.recommendations[0].rank).toBe(1);
  });

  it("scores the maximum distance as 0", () => {
    const result = matchPerfumes({
      personalityVector: flat(0),
      perfumes: [candidate("p-far", flat(100))],
    });

    expect(result.recommendations[0].distance).toBe(MAX_DISTANCE);
    expect(result.recommendations[0].distance).toBeCloseTo(
      Math.sqrt(5) * 100,
      10,
    );
    expect(result.recommendations[0].score).toBe(0);
    expect(result.recommendations[0].presentationScore).toBe(0);
  });

  it("matches the manually calculated intermediate result (0 vs 50 → 50)", () => {
    // distance = sqrt(5 × 50²) ≈ 111.803 → 100 × (1 − 111.803/223.607) = 50
    const result = matchPerfumes({
      personalityVector: flat(0),
      perfumes: [candidate("p-mid", flat(50))],
    });

    expect(result.recommendations[0].distance).toBeCloseTo(
      Math.sqrt(5) * 50,
      10,
    );
    expect(result.recommendations[0].score).toBeCloseTo(50, 10);
  });

  it("matches the manually calculated intermediate result (50 vs 40 → 90)", () => {
    // distance = sqrt(5 × 10²) ≈ 22.361 → 100 × (1 − 22.361/223.607) = 90
    const result = matchPerfumes({
      personalityVector: flat(50),
      perfumes: [candidate("p-mid2", flat(40))],
    });

    expect(result.recommendations[0].distance).toBeCloseTo(
      Math.sqrt(5) * 10,
      10,
    );
    expect(result.recommendations[0].score).toBeCloseTo(90, 10);
  });

  it("keeps one axis off-centre to verify partial-distance maths", () => {
    // 4 axes equal, 1 axis off by 5 → distance 5 → 100 × (1 − 5/223.607)
    const vector = flat(50);
    const profile = offsetProfile(50, "bold", 5);

    const result = matchPerfumes({
      personalityVector: vector,
      perfumes: [candidate("p-off", profile)],
    });

    expect(result.recommendations[0].distance).toBeCloseTo(5, 10);
    expect(result.recommendations[0].score).toBeCloseTo(
      100 * (1 - 5 / MAX_DISTANCE),
      10,
    );
  });

  it("rounds the presentation score to exactly one decimal", () => {
    expect(toPresentationScore(99.96)).toBe(100);
    expect(toPresentationScore(87.77)).toBe(87.8);
    expect(toPresentationScore(50.44)).toBe(50.4);
    expect(toPresentationScore(0)).toBe(0);
  });
});

describe("ranking and ordering", () => {
  it("ranks the closest profile first", () => {
    const result = matchPerfumes({
      personalityVector: flat(50),
      perfumes: [
        candidate("p-far", offsetProfile(50, "bold", 40)),
        candidate("p-close", offsetProfile(50, "bold", 5)),
        candidate("p-mid", offsetProfile(50, "bold", 20)),
      ],
    });

    expect(result.recommendations.map((r) => r.perfumeId)).toEqual([
      "p-close",
      "p-mid",
      "p-far",
    ]);
    expect(result.recommendations.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(result.excluded).toBe(0);
  });

  it("breaks ties deterministically by ascending perfume id", () => {
    const identical = flat(60);

    const first = matchPerfumes({
      personalityVector: flat(60),
      perfumes: [candidate("b-tie", identical), candidate("a-tie", identical)],
    });
    const second = matchPerfumes({
      personalityVector: flat(60),
      perfumes: [candidate("a-tie", identical), candidate("b-tie", identical)],
    });

    for (const result of [first, second]) {
      expect(result.recommendations.map((r) => r.perfumeId)).toEqual([
        "a-tie",
        "b-tie",
      ]);
      expect(result.recommendations.map((r) => r.rank)).toEqual([1, 2]);
    }
  });

  it("does not depend on the input order (determinism)", () => {
    const perfumes = [
      candidate("p-1", offsetProfile(50, "social", 10)),
      candidate("p-2", offsetProfile(50, "adventurous", 20)),
      candidate("p-3", offsetProfile(50, "mysterious", 30)),
      candidate("p-4", offsetProfile(50, "elegant", 40)),
    ];

    const forward = matchPerfumes({ personalityVector: flat(50), perfumes });
    const reversed = matchPerfumes({
      personalityVector: flat(50),
      perfumes: [...perfumes].reverse(),
    });
    const again = matchPerfumes({ personalityVector: flat(50), perfumes });

    expect(reversed).toEqual(forward);
    expect(again).toEqual(forward);
  });
});

describe("topN handling", () => {
  const inventory = () =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
      candidate(`p-${String(n).padStart(2, "0")}`, offsetProfile(50, "bold", n * 3)),
    );

  it("returns exactly 3 of 10 when topN = 3", () => {
    const result = matchPerfumes({
      personalityVector: flat(50),
      perfumes: inventory(),
      topN: 3,
    });

    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("defaults to 5 when topN is omitted", () => {
    const result = matchPerfumes({ personalityVector: flat(50), perfumes: inventory() });

    expect(resolveTopN(undefined)).toBe(DEFAULT_TOP_N);
    expect(result.recommendations).toHaveLength(DEFAULT_TOP_N);
  });

  it("returns the whole inventory when topN exceeds it", () => {
    const result = matchPerfumes({
      personalityVector: flat(50),
      perfumes: inventory(),
      topN: 25,
    });

    expect(result.recommendations).toHaveLength(10);
  });

  it("rejects invalid topN values", () => {
    for (const bad of [0, -1, 1.5, "3", null]) {
      expect(() => resolveTopN(bad)).toThrowError(/invalid topN/);
      expect(() =>
        matchPerfumes({
          personalityVector: flat(50),
          perfumes: inventory(),
          topN: bad,
        }),
      ).toThrowError(/invalid topN/);
    }
  });
});

describe("eligibility policy", () => {
  it("returns an empty list for an empty inventory", () => {
    const result = matchPerfumes({ personalityVector: flat(50), perfumes: [] });

    expect(result.recommendations).toEqual([]);
    expect(result.excluded).toBe(0);
  });

  it("never returns an inactive perfume", () => {
    const result = matchPerfumes({
      personalityVector: flat(50),
      perfumes: [
        candidate("p-off", flat(50), { active: false }),
        candidate("p-on", flat(50)),
      ],
    });

    expect(result.recommendations.map((r) => r.perfumeId)).toEqual(["p-on"]);
    expect(result.excluded).toBe(1);
  });

  it("never returns an out-of-stock perfume (inventory contract)", () => {
    const result = matchPerfumes({
      personalityVector: flat(50),
      perfumes: [
        candidate("p-oos", flat(50), { inStock: false }),
        candidate("p-stock", flat(50)),
      ],
    });

    expect(result.recommendations.map((r) => r.perfumeId)).toEqual(["p-stock"]);
    expect(result.excluded).toBe(1);
  });

  it("excludes out-of-stock even when it would otherwise rank first", () => {
    // The out-of-stock perfume is the CLOSEST match — it must still be dropped.
    const result = matchPerfumes({
      personalityVector: flat(50),
      perfumes: [
        candidate("p-oos-perfect", flat(50), { inStock: false }),
        candidate("p-stock-far", offsetProfile(50, "bold", 40)),
      ],
    });

    expect(result.recommendations.map((r) => r.perfumeId)).toEqual([
      "p-stock-far",
    ]);
    expect(result.excluded).toBe(1);
  });

  it("excludes perfumes with a missing profile instead of guessing values", () => {
    const result = matchPerfumes({
      personalityVector: flat(50),
      perfumes: [
        candidate("p-null", null),
        candidate("p-undefined"),
        candidate("p-ok", flat(50)),
      ],
    });

    expect(result.recommendations.map((r) => r.perfumeId)).toEqual(["p-ok"]);
    expect(result.excluded).toBe(2);
  });

  it("excludes perfumes with an out-of-range or fractional profile value", () => {
    const outOfRange = { ...flat(50), bold: 101 };
    const fractional = { ...flat(50), social: 50.5 };

    const result = matchPerfumes({
      personalityVector: flat(50),
      perfumes: [
        candidate("p-range", outOfRange),
        candidate("p-frac", fractional),
        candidate("p-ok", flat(50)),
      ],
    });

    expect(result.recommendations.map((r) => r.perfumeId)).toEqual(["p-ok"]);
    expect(result.excluded).toBe(2);
  });

  it("rejects invalid personality vectors loudly", () => {
    const missingBold = { ...flat(50) } as Record<string, number>;
    delete missingBold.bold;

    for (const bad of [
      null,
      undefined,
      {},
      missingBold,
      flat(101),
      { ...flat(50), social: 50.5 },
      "nope",
    ]) {
      expect(() =>
        matchPerfumes({
          personalityVector: bad,
          perfumes: [candidate("p-ok", flat(50))],
        }),
      ).toThrowError(/invalid personality vector/);
    }

    expect(() => validatePersonalityVector(flat(50))).not.toThrow();
  });
});

describe("store isolation", () => {
  const twoStores = () => [
    candidate("a-1", offsetProfile(50, "bold", 5)),
    candidate("a-2", offsetProfile(50, "bold", 20)),
    candidate("b-1", flat(50), { storeId: "store-b" }),
    candidate("b-2", flat(50), { storeId: "store-b" }),
  ];

  it("never returns perfumes from another store", () => {
    const result = matchPerfumes({
      storeId: "store-a",
      personalityVector: flat(50),
      perfumes: twoStores(),
    });

    expect(result.recommendations.map((r) => r.perfumeId)).toEqual(["a-1", "a-2"]);

    for (const recommendation of result.recommendations) {
      expect(recommendation.storeId).toBe("store-a");
    }

    expect(result.excluded).toBe(2);
  });

  it("keeps store-b recommendations free of store-a perfumes", () => {
    const result = matchPerfumes({
      storeId: "store-b",
      personalityVector: flat(50),
      perfumes: twoStores(),
    });

    expect(result.recommendations.map((r) => r.storeId)).toEqual([
      "store-b",
      "store-b",
    ]);
    expect(
      result.recommendations.every((r) => r.perfumeId.startsWith("b-")),
    ).toBe(true);
  });
});

describe("result shape", () => {
  it("carries the fields the future API and UI need", () => {
    const result = matchPerfumes({
      personalityVector: flat(50),
      perfumes: [candidate("p-shape", flat(50))],
    });

    expect(result.recommendations[0]).toMatchObject({
      rank: 1,
      perfumeId: "p-shape",
      storeId: "store-a",
      name: "Perfume p-shape",
      brand: "Demo Maison",
      slug: "p-shape",
      productUrl: "https://demo.example.com/p/p-shape",
      imageUrl: null,
      score: 100,
      presentationScore: 100,
    });
  });
});
