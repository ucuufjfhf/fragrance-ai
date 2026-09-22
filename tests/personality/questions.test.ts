import { describe, expect, it } from "vitest";

import {
  QUIZ_QUESTION_COUNT,
  QUIZ_QUESTIONS,
  getOptionById,
  getQuestionById,
} from "@/lib/personality/questions";
import { computeBounds } from "@/lib/personality/scoring";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";

const PERSIAN_TEXT = /[\u0600-\u06FF]/;

describe("quiz questions", () => {
  it("defines exactly 10 questions with unique ids and sequential order", () => {
    expect(QUIZ_QUESTION_COUNT).toBe(10);
    expect(QUIZ_QUESTIONS).toHaveLength(10);
    expect(new Set(QUIZ_QUESTIONS.map((question) => question.id)).size).toBe(10);
    expect(QUIZ_QUESTIONS.map((question) => question.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("provides Persian prompts and at least two uniquely identified options", () => {
    for (const question of QUIZ_QUESTIONS) {
      expect(question.prompt).toMatch(PERSIAN_TEXT);
      expect(question.options.length).toBeGreaterThanOrEqual(2);

      const optionIds = question.options.map((option) => option.id);
      expect(new Set(optionIds).size).toBe(optionIds.length);

      for (const option of question.options) {
        expect(option.label).toMatch(PERSIAN_TEXT);
      }
    }
  });

  it("only scores known dimensions with integer deltas inside -10..10", () => {
    for (const question of QUIZ_QUESTIONS) {
      for (const option of question.options) {
        const entries = Object.entries(option.vector);
        expect(entries.length).toBeGreaterThan(0);

        for (const [dimension, delta] of entries) {
          expect(PERSONALITY_DIMENSIONS).toContain(dimension);

          const value = delta ?? 0;
          expect(Number.isInteger(value)).toBe(true);
          expect(Math.abs(value)).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it("exposes a reachable raw range for every dimension", () => {
    const bounds = computeBounds(QUIZ_QUESTIONS);

    for (const dimension of PERSONALITY_DIMENSIONS) {
      expect(bounds[dimension].max).toBeGreaterThan(bounds[dimension].min);
    }
  });

  it("looks questions and options up by id", () => {
    const question = getQuestionById("social-energy");

    expect(question?.order).toBe(2);
    expect(getQuestionById("does-not-exist")).toBeUndefined();

    if (question) {
      expect(getOptionById(question, "center")?.id).toBe("center");
      expect(getOptionById(question, "not-an-option")).toBeUndefined();
    }
  });
});
