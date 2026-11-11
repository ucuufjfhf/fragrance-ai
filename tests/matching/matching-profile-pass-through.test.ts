import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { toMatchingProfile, MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import { matchPerfumes } from "@/lib/matching/engine";
import { similarityScore } from "@/lib/matching/score";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { PersonalityVector } from "@/types/personality";
import type { MatchCandidateInput } from "@/types/recommendation";

/**
 * Batch 39 — the five matching values threaded through the engine output.
 *
 * The head-to-head block needs each recommendation's own five-axis profile, but
 * `MatchedPerfume` never carried it. The engine now copies the profile it had
 * already validated and scored with. These pins hold the pass-through contract:
 * the values are verbatim, and the ranked result is byte-identical to the
 * pre-batch computation — eligibility, distance, score and order cannot move.
 */

const ENGINE_SOURCE = readFileSync(
  new URL("../../lib/matching/engine.ts", import.meta.url),
  "utf8",
);

/** A flat nine-axis vector: every dimension set to `value`. */
const flat = (value: number): PersonalityVector =>
  Object.fromEntries(
    PERSONALITY_DIMENSIONS.map((dimension) => [dimension, value]),
  ) as PersonalityVector;

/** Same profile as `flat`, but with one matching axis moved by `offset`. */
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

const inventory = (): MatchCandidateInput[] => [
  candidate("p-close", offsetProfile(50, "bold", 4)),
  candidate("p-mid", offsetProfile(50, "bold", 18)),
  candidate("p-far", offsetProfile(50, "mysterious", 30)),
  candidate("p-out", offsetProfile(50, "fresh", 45), { inStock: false }),
  candidate("p-off", offsetProfile(50, "warm", 60), { active: false }),
];

const vector = flat(50);
const result = matchPerfumes({ personalityVector: vector, perfumes: inventory(), topN: 3 });

describe("engine pass-through of the five matching values", () => {
  it("copies exactly the candidate's five values, verbatim and unrounded", () => {
    const byId = new Map(inventory().map((item) => [item.perfumeId, item]));

    expect(result.recommendations).toHaveLength(3);
    for (const recommendation of result.recommendations) {
      const source = byId.get(recommendation.perfumeId)!;
      const expected = toMatchingProfile(source.profile);

      expect(recommendation.matchingProfile).toEqual(expected);
      // Exactly the five matching axes — no personality-only axis sneaks in.
      expect(Object.keys(recommendation.matchingProfile!).sort()).toEqual(
        [...MATCHING_DIMENSIONS].sort(),
      );

      for (const axis of MATCHING_DIMENSIONS) {
        const value = recommendation.matchingProfile![axis];
        expect(value).toBe(source.profile![axis]);
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it("leaves distance, score and ranking exactly as the pre-batch formula", () => {
    // Recomputed independently, the way the engine did before the field
    // existed: score each eligible candidate, sort desc by score then asc by id.
    const reference = inventory()
      .filter((item) => item.active && item.inStock)
      .map((item) => {
        const profile = toMatchingProfile(item.profile)!;
        const { distance, rawScore, presentationScore } = similarityScore(
          vector,
          profile,
        );
        return { perfumeId: item.perfumeId, distance, score: rawScore, presentationScore };
      })
      .sort((a, b) =>
        b.score !== a.score
          ? b.score - a.score
          : a.perfumeId < b.perfumeId
            ? -1
            : 1,
      )
      .slice(0, 3);

    const actual = result.recommendations.map((recommendation) => ({
      perfumeId: recommendation.perfumeId,
      distance: recommendation.distance,
      score: recommendation.score,
      presentationScore: recommendation.presentationScore,
    }));

    expect(actual).toEqual(reference);
    expect(result.recommendations.map((row) => row.rank)).toEqual([1, 2, 3]);

    // Stripping the display field reproduces the old shape byte for byte.
    const legacyShape = result.recommendations.map(
      ({ matchingProfile: _display, ...rest }) => rest,
    );
    expect(legacyShape.map((row) => row.perfumeId)).toEqual(
      reference.map((row) => row.perfumeId),
    );
    expect(Object.keys(legacyShape[0])).not.toContain("matchingProfile");
  });

  it("keeps the field out of scoring and out of the sort comparator", () => {
    // It is assigned in the result push…
    expect(ENGINE_SOURCE).toContain("matchingProfile: profile,");

    // …the scorer only ever receives the vector and the profile…
    const scoreCall = ENGINE_SOURCE.slice(
      ENGINE_SOURCE.indexOf("similarityScore("),
      ENGINE_SOURCE.indexOf("scored.push("),
    );
    expect(scoreCall).not.toContain("matchingProfile");

    // …and the comparator still reads score and perfumeId only.
    const sortBody = ENGINE_SOURCE.slice(
      ENGINE_SOURCE.indexOf("scored.sort("),
      ENGINE_SOURCE.indexOf("const recommendations ="),
    );
    expect(sortBody).toContain("b.score - a.score");
    expect(sortBody).toContain("a.perfumeId < b.perfumeId");
    expect(sortBody).not.toContain("matchingProfile");
  });
});
