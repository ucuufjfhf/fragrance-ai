import { describe, expect, it } from "vitest";

import {
  MATCHING_DIMENSIONS,
  NON_MATCHING_PROFILE_AXES,
  PROFILE_AXES,
  toMatchingProfile,
  toPersonalityVector,
} from "@/lib/fragrance/profile";
import { validateAiProfileResult } from "@/lib/ai/perfume-profile";
import { MAX_DISTANCE, similarityScore } from "@/lib/matching/score";
import { matchPerfumes } from "@/lib/matching/engine";
import { getReferenceCatalogCandidates } from "@/lib/matching/reference-catalog";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";
import { ARCHETYPES } from "@/lib/personality/archetypes";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { PersonalityVector } from "@/types/personality";
import type { MatchCandidateInput } from "@/types/recommendation";

/**
 * The four personality-only axes are valid user dimensions that no fragrance
 * can signal. These tests pin the consequence: they exist everywhere on the
 * user side and are absent from the distance.
 */
const INERT_AXES = [
  "social",
  "adventurous",
  "expressive",
  "experimental",
] as const;

const CANDIDATES = getReferenceCatalogCandidates();
const TOP_N = 5;

/** The pre-change 9-dimensional ranking, reimplemented here as the oracle. */
const NINE_DIM_MAX_DISTANCE = 300;

function rankNineDim(
  vector: PersonalityVector,
  perfumes: readonly MatchCandidateInput[],
  topN: number,
): string[] {
  const scored = perfumes.map((candidate) => {
    const profile = candidate.profile as Record<string, number>;
    let squared = 0;
    for (const axis of PERSONALITY_DIMENSIONS) {
      const difference = vector[axis] - profile[axis];
      squared += difference * difference;
    }
    const distance = Math.sqrt(squared);
    return {
      perfumeId: candidate.perfumeId,
      score: 100 * (1 - distance / NINE_DIM_MAX_DISTANCE),
    };
  });

  scored.sort(
    (a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.perfumeId < b.perfumeId
          ? -1
          : a.perfumeId > b.perfumeId
            ? 1
            : 0,
  );

  return scored.slice(0, topN).map((entry) => entry.perfumeId);
}

function rankCurrent(
  vector: PersonalityVector,
  perfumes: readonly MatchCandidateInput[],
  topN: number,
): string[] {
  return matchPerfumes({ personalityVector: vector, perfumes, topN }).recommendations.map(
    (entry) => entry.perfumeId,
  );
}

/** Every attainable quiz vector, via the production scorer. */
const ALL_QUIZ_VECTORS: PersonalityVector[] = (() => {
  const vectors: PersonalityVector[] = [];
  for (const archetype of ARCHETYPES) {
    vectors.push(archetype.centroid);
  }
  for (let mask = 0; mask < 3 ** QUIZ_QUESTIONS.length; mask += 1) {
    let remaining = mask;
    const answers = QUIZ_QUESTIONS.map((question) => {
      const index = remaining % question.options.length;
      remaining = Math.floor(remaining / question.options.length);
      return { questionId: question.id, optionId: question.options[index]!.id };
    });
    vectors.push(scoreQuiz(answers).vector);
  }
  return vectors;
})();

/** A deterministic stride sample — the exhaustive check lives in the audit harness. */
const SAMPLED_VECTORS = ALL_QUIZ_VECTORS.filter(
  (_, index) => index % 137 === 0,
);

describe("personality dimensions vs matching dimensions", () => {
  it("1. PersonalityVector still contains all 9 dimensions", () => {
    expect(PERSONALITY_DIMENSIONS).toHaveLength(9);
    expect([...PROFILE_AXES]).toEqual([...PERSONALITY_DIMENSIONS]);

    const vector = scoreQuiz(
      QUIZ_QUESTIONS.map((question) => ({
        questionId: question.id,
        optionId: question.options[0]!.id,
      })),
    ).vector;

    expect(Object.keys(vector).sort()).toEqual([...PERSONALITY_DIMENSIONS].sort());
  });

  it("2. MatchingVector contains only the 5 scent axes", () => {
    expect([...MATCHING_DIMENSIONS]).toEqual([
      "fresh",
      "warm",
      "mysterious",
      "elegant",
      "bold",
    ]);
    expect(MATCHING_DIMENSIONS).toHaveLength(5);

    const row = Object.fromEntries(
      PROFILE_AXES.map((axis) => [axis, 50]),
    ) as PersonalityVector;

    const matching = toMatchingProfile(row);

    expect(Object.keys(matching!).sort()).toEqual([...MATCHING_DIMENSIONS].sort());
    for (const axis of INERT_AXES) {
      expect(matching).not.toHaveProperty(axis);
    }

    // ...while the stored row is still complete over all nine.
    expect(toPersonalityVector(row)).not.toBeNull();
  });

  it("3. the four personality-only axes cannot influence ranking", () => {
    const base = SAMPLED_VECTORS[0]!;

    for (const axis of INERT_AXES) {
      for (const value of [0, 40, 50, 100]) {
        const mutated: PersonalityVector = { ...base, [axis]: value };
        const original = matchPerfumes({
          personalityVector: base,
          perfumes: CANDIDATES,
          topN: TOP_N,
        });
        const changed = matchPerfumes({
          personalityVector: mutated,
          perfumes: CANDIDATES,
          topN: TOP_N,
        });

        expect(changed.recommendations.map((r) => r.perfumeId)).toEqual(
          original.recommendations.map((r) => r.perfumeId),
        );
        expect(changed.recommendations.map((r) => r.score)).toEqual(
          original.recommendations.map((r) => r.score),
        );
        expect(changed.recommendations.map((r) => r.distance)).toEqual(
          original.recommendations.map((r) => r.distance),
        );
      }
    }
  });

  it("3b. perfumes carrying any inert-axis value rank identically", () => {
    const base = SAMPLED_VECTORS[1]!;

    // Two inventories with IDENTICAL scored axes (the real curated profiles)
    // that differ only in the four non-scored axes.
    const withInert = (fill: (index: number) => number): MatchCandidateInput[] =>
      CANDIDATES.map((candidate, index) => ({
        ...candidate,
        profile: {
          ...(candidate.profile as PersonalityVector),
          social: fill(index),
          adventurous: fill(index + 1),
          expressive: fill(index + 2),
          experimental: fill(index + 3),
        },
      }));

    const constant = withInert(() => 40);
    const varied = withInert((index) => index % 101);

    const a = matchPerfumes({
      personalityVector: base,
      perfumes: constant,
      topN: TOP_N,
    });
    const b = matchPerfumes({
      personalityVector: base,
      perfumes: varied,
      topN: TOP_N,
    });

    expect(b.recommendations.map((r) => r.perfumeId)).toEqual(
      a.recommendations.map((r) => r.perfumeId),
    );
    expect(b.recommendations.map((r) => r.distance)).toEqual(
      a.recommendations.map((r) => r.distance),
    );
    expect(b.recommendations.map((r) => r.score)).toEqual(
      a.recommendations.map((r) => r.score),
    );
  });

  it("4. the 59 curated candidates rank exactly as the pre-change 9D engine did", () => {
    expect(CANDIDATES).toHaveLength(59);

    for (const vector of SAMPLED_VECTORS) {
      expect(rankCurrent(vector, CANDIDATES, TOP_N)).toEqual(
        rankNineDim(vector, CANDIDATES, TOP_N),
      );
    }
  });

  it("5. eligibility behaviour is unchanged", () => {
    const vector = SAMPLED_VECTORS[0]!;
    const complete = Object.fromEntries(
      PROFILE_AXES.map((axis) => [axis, 50]),
    ) as PersonalityVector;

    const candidate = (
      perfumeId: string,
      overrides: Partial<MatchCandidateInput> = {},
      profile: MatchCandidateInput["profile"] = complete,
    ): MatchCandidateInput => ({
      perfumeId,
      storeId: "store-a",
      name: perfumeId,
      brand: "Demo",
      inStock: true,
      active: true,
      profile,
      ...overrides,
    });

    // store isolation
    const isolated = matchPerfumes({
      storeId: "store-a",
      personalityVector: vector,
      perfumes: [
        candidate("a-1", { storeId: "store-a" }),
        candidate("b-1", { storeId: "store-b" }),
      ],
    });
    expect(isolated.recommendations.map((r) => r.perfumeId)).toEqual(["a-1"]);
    expect(isolated.excluded).toBe(1);

    // active / inStock filters
    expect(
      matchPerfumes({
        personalityVector: vector,
        perfumes: [
          candidate("off", { active: false }),
          candidate("oos", { inStock: false }),
          candidate("ok"),
        ],
      }),
    ).toMatchObject({
      recommendations: [{ perfumeId: "ok" }],
      excluded: 2,
    });

    // a profile missing ANY axis — including a NON-matching one — is still
    // excluded: completeness is unchanged by this refactor.
    for (const axis of PROFILE_AXES) {
      const incomplete = { ...complete } as Record<string, number>;
      delete incomplete[axis];

      const result = matchPerfumes({
        personalityVector: vector,
        perfumes: [candidate("partial", {}, incomplete as never), candidate("ok")],
      });

      expect(result.recommendations.map((r) => r.perfumeId)).toEqual(["ok"]);
      expect(result.excluded).toBe(1);
    }

    // out-of-range and fractional stored values are still rejected
    for (const bad of [
      { ...complete, bold: 101 },
      { ...complete, social: 50.5 },
      { ...complete, fresh: -1 },
    ]) {
      const result = matchPerfumes({
        personalityVector: vector,
        perfumes: [candidate("bad", {}, bad as never), candidate("ok")],
      });
      expect(result.recommendations.map((r) => r.perfumeId)).toEqual(["ok"]);
      expect(result.excluded).toBe(1);
    }

    // a null profile is still excluded
    const nullProfile = matchPerfumes({
      personalityVector: vector,
      perfumes: [candidate("none", {}, null), candidate("ok")],
    });
    expect(nullProfile.recommendations.map((r) => r.perfumeId)).toEqual(["ok"]);
    expect(nullProfile.excluded).toBe(1);
  });

  it("6. determinism is intact", () => {
    const vector = SAMPLED_VECTORS[2]!;

    const first = matchPerfumes({
      personalityVector: vector,
      perfumes: CANDIDATES,
      topN: 10,
    });
    const second = matchPerfumes({
      personalityVector: vector,
      perfumes: CANDIDATES,
      topN: 10,
    });
    const reversed = matchPerfumes({
      personalityVector: vector,
      perfumes: [...CANDIDATES].reverse(),
      topN: 10,
    });

    expect(second).toEqual(first);
    expect(reversed).toEqual(first);
  });

  it("7. scoring uses the 5D maximum distance", () => {
    expect(MATCHING_DIMENSIONS).toHaveLength(5);
    expect(MAX_DISTANCE).toBeCloseTo(Math.sqrt(5) * 100, 10);

    const zero: PersonalityVector = Object.fromEntries(
      PROFILE_AXES.map((axis) => [axis, 0]),
    ) as PersonalityVector;
    const hundred = Object.fromEntries(
      PROFILE_AXES.map((axis) => [axis, 100]),
    ) as PersonalityVector;

    const { distance, rawScore } = similarityScore(zero, toMatchingProfile(hundred)!);

    expect(distance).toBeCloseTo(MAX_DISTANCE, 10);
    expect(rawScore).toBe(0);
  });

  it("8. the AI still cannot write ANY stored profile axis", () => {
    const input = {
      perfumeId: "p-1",
      name: "Test",
      brand: "Demo",
      matchingProfile: Object.fromEntries(
        PROFILE_AXES.map((axis) => [axis, 50]),
      ) as PersonalityVector,
    };

    for (const axis of PROFILE_AXES) {
      expect(() =>
        validateAiProfileResult(
          { descriptors: { [axis]: 90 } },
          input as never,
        ),
      ).toThrowError(/read-only matching axis|forbidden key/);
    }

    // A descriptor is still accepted, so the guard is specific.
    const ok = validateAiProfileResult(
      { descriptors: { woody: 70 } },
      input as never,
    );
    expect(ok.descriptors).toEqual({ woody: 70 });
  });

  it("documents the non-matching axes explicitly", () => {
    expect([...NON_MATCHING_PROFILE_AXES].sort()).toEqual(
      [...INERT_AXES].sort(),
    );
  });
});
