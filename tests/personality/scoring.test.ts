import { describe, expect, it } from "vitest";

import { nearestArchetype } from "@/lib/personality/archetypes";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import {
  accumulateRawScores,
  orderAnswers,
  scoreQuiz,
  validateAnswers,
} from "@/lib/personality/scoring";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type {
  PersonalityDimension,
  PersonalityVector,
  QuizAnswer,
} from "@/types/personality";

const allOf = (index: (questionIndex: number, optionCount: number) => number): QuizAnswer[] =>
  QUIZ_QUESTIONS.map((question, questionIndex) => ({
    questionId: question.id,
    optionId:
      question.options[index(questionIndex, question.options.length)].id,
  }));

const allFirst = (): QuizAnswer[] => allOf(() => 0);
const allLast = (): QuizAnswer[] => allOf((_, optionCount) => optionCount - 1);
const mixed = (): QuizAnswer[] =>
  allOf((questionIndex, optionCount) => questionIndex % optionCount);

/** Picks, per question, the option with the highest (or lowest) delta. */
function extreme(
  dimension: PersonalityDimension,
  mode: "max" | "min",
): QuizAnswer[] {
  return QUIZ_QUESTIONS.map((question) => {
    const deltas = question.options.map(
      (option) => option.vector[dimension] ?? 0,
    );
    const target = mode === "max" ? Math.max(...deltas) : Math.min(...deltas);
    const option = question.options[deltas.indexOf(target)];

    return { questionId: question.id, optionId: option.id };
  });
}

describe("scoring engine", () => {
  it("normalises every dimension to 0–100", () => {
    for (const answers of [allFirst(), allLast(), mixed()]) {
      const { vector } = scoreQuiz(answers);

      for (const dimension of PERSONALITY_DIMENSIONS) {
        const value = vector[dimension];
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("returns identical results for identical answers (deterministic)", () => {
    expect(scoreQuiz(allFirst())).toEqual(scoreQuiz(allFirst()));
    expect(scoreQuiz(mixed())).toEqual(scoreQuiz(mixed()));
  });

  it("does not depend on the order of the answers array", () => {
    const answers = mixed();
    const reversed = [...answers].reverse();

    expect(scoreQuiz(reversed).vector).toEqual(scoreQuiz(answers).vector);
    expect(scoreQuiz(reversed).archetype.id).toBe(scoreQuiz(answers).archetype.id);
  });

  it("reaches exactly 100 and 0 on the boundary answer sheets", () => {
    for (const dimension of PERSONALITY_DIMENSIONS) {
      expect(scoreQuiz(extreme(dimension, "max")).vector[dimension], dimension).toBe(100);
      expect(scoreQuiz(extreme(dimension, "min")).vector[dimension], dimension).toBe(0);
    }
  });

  it("ignores unknown and duplicated answers", () => {
    const answers = allFirst();
    const polluted: QuizAnswer[] = [
      ...answers,
      { questionId: answers[0].questionId, optionId: answers[1].optionId },
      { questionId: "unknown-question", optionId: "trusted" },
      { questionId: QUIZ_QUESTIONS[0].id, optionId: "unknown-option" },
    ];

    expect(scoreQuiz(polluted).vector).toEqual(scoreQuiz(answers).vector);
  });

  it("keeps partial answer sheets inside the 0–100 range", () => {
    const result = scoreQuiz(allFirst().slice(0, 4));

    expect(result.answers).toHaveLength(4);
    for (const dimension of PERSONALITY_DIMENSIONS) {
      expect(result.raw[dimension]).toBe(
        accumulateRawScores(allFirst().slice(0, 4))[dimension],
      );
      expect(result.vector[dimension]).toBeGreaterThanOrEqual(0);
      expect(result.vector[dimension]).toBeLessThanOrEqual(100);
    }
  });

  it("labels the profile with the nearest archetype and orders the answers", () => {
    const answers = allLast();
    const result = scoreQuiz(answers);

    expect(result.archetype.id).toBe(nearestArchetype(result.vector).id);
    expect(orderAnswers(answers).map((answer) => answer.questionId)).toEqual(
      QUIZ_QUESTIONS.map((question) => question.id),
    );
  });
});

describe("scoring regression lock", () => {
  /**
   * Recorded profiles of the current questions, weights and archetype centroids.
   *
   * This is the tuning tripwire: changing any question vector, weight or centroid
   * is expected to fail here, which forces the change to be reviewed on purpose.
   */
  const lockedProfiles: Array<[string, QuizAnswer[], string, PersonalityVector]> = [
    [
      "all first options",
      allFirst(),
      "bold-one",
      {
        social: 61,
        adventurous: 86,
        expressive: 48,
        mysterious: 38,
        fresh: 45,
        warm: 20,
        experimental: 63,
        elegant: 42,
        bold: 64,
      },
    ],
    [
      "all last options",
      allLast(),
      "clean-minimalist",
      {
        social: 36,
        adventurous: 17,
        expressive: 59,
        mysterious: 38,
        fresh: 42,
        warm: 27,
        experimental: 37,
        elegant: 40,
        bold: 33,
      },
    ],
    [
      "mixed answers",
      mixed(),
      "romantic",
      {
        social: 44,
        adventurous: 45,
        expressive: 52,
        mysterious: 27,
        fresh: 42,
        warm: 73,
        experimental: 22,
        elegant: 35,
        bold: 33,
      },
    ],
  ];

  it.each(lockedProfiles)(
    "locks the recorded profile for %s",
    (_name, answers, archetypeId, vector) => {
      const result = scoreQuiz(answers);

      expect(result.archetype.id).toBe(archetypeId);
      expect(result.vector).toEqual(vector);
    },
  );
});

describe("validateAnswers", () => {
  it("accepts a complete answer sheet and returns it as-is", () => {
    const answers = allFirst();
    const result = validateAnswers(answers);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.answers).toEqual(answers);
    }
  });

  it("rejects malformed payloads with a reason", () => {
    const complete = allFirst();
    const invalidPayloads: Array<[string, unknown]> = [
      ["not an array", { answers: complete }],
      ["null", null],
      ["too few answers", complete.slice(0, 9)],
      ["too many answers", [...complete, { questionId: "x", optionId: "y" }]],
      [
        "duplicate question",
        [...complete.slice(0, 9), { ...complete[0] }],
      ],
      [
        "unknown question",
        [...complete.slice(0, 9), { questionId: "nope", optionId: "trusted" }],
      ],
      [
        "unknown option",
        [
          ...complete.slice(0, 9),
          { questionId: QUIZ_QUESTIONS[9].id, optionId: "nope" },
        ],
      ],
      ["non-object item", [...complete.slice(0, 9), 42]],
      [
        "missing optionId",
        [...complete.slice(0, 9), { questionId: QUIZ_QUESTIONS[9].id }],
      ],
    ];

    for (const [name, payload] of invalidPayloads) {
      const result = validateAnswers(payload);

      expect(result.ok, name).toBe(false);
      if (!result.ok) {
        expect(result.reason.length, name).toBeGreaterThan(0);
      }
    }
  });
});
