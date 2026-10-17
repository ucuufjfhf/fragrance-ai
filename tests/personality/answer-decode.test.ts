import { describe, expect, it } from "vitest";

import {
  decodeAnswers,
  MAX_DECODED_ANSWERS,
} from "@/lib/personality/answer-decode";
import { PERSONALITY_LABELS } from "@/lib/personality/labels";
import { QUIZ_QUESTIONS, getOptionById } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";
import type { QuizAnswer } from "@/types/personality";

/** A complete real sheet: first option everywhere. */
const realSheet = (): QuizAnswer[] =>
  QUIZ_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: question.options[0].id,
  }));

const vectorOf = (answers: QuizAnswer[]) => scoreQuiz(answers).vector;

describe("decodeAnswers", () => {
  it("returns at most three links from a real sheet", () => {
    const answers = realSheet();
    const decoded = decodeAnswers(answers, vectorOf(answers));

    expect(decoded.length).toBeGreaterThan(0);
    expect(decoded.length).toBeLessThanOrEqual(MAX_DECODED_ANSWERS);
    expect(MAX_DECODED_ANSWERS).toBe(3);
  });

  it("links only real answers to their own vectors' traits", () => {
    const answers = realSheet();
    const decoded = decodeAnswers(answers, vectorOf(answers));

    for (const item of decoded) {
      const question = QUIZ_QUESTIONS.find((q) => q.id === item.questionId)!;
      const option = getOptionById(question, item.optionId)!;

      // Labels verbatim from the bank — the shopper's own words.
      expect(item.optionLabel).toBe(option.label);
      expect(item.questionPrompt).toBe(question.prompt);
      expect(item.traitLabel).toBe(PERSONALITY_LABELS[item.dimension]);

      // The link is the option's OWN delta — positive push only.
      expect(option.vector[item.dimension] ?? 0).toBeGreaterThan(0);

      // A computed share, strictly inside (0, 1].
      expect(item.share).toBeGreaterThan(0);
      expect(item.share).toBeLessThanOrEqual(1);
    }

    // One answer per trait at most: no answer is spent twice.
    const questions = decoded.map((item) => item.questionId);
    expect(new Set(questions).size).toBe(questions.length);
  });

  it("drops fabricated pairs instead of inventing links", () => {
    const answers: QuizAnswer[] = [
      ...realSheet(),
      { questionId: "no-such-question", optionId: "no-such-option" },
      { questionId: QUIZ_QUESTIONS[0].id, optionId: "no-such-option" },
    ];
    const decoded = decodeAnswers(answers, vectorOf(realSheet()));

    for (const item of decoded) {
      expect(item.questionId).not.toBe("no-such-question");
      expect(item.optionId).not.toBe("no-such-option");
    }
  });

  it("stays silent when nothing moved the needle", () => {
    expect(decodeAnswers([], vectorOf(realSheet()))).toEqual([]);
    expect(
      decodeAnswers(
        [{ questionId: "no-such-question", optionId: "no-such-option" }],
        vectorOf(realSheet()),
      ),
    ).toEqual([]);
  });

  it("is deterministic for the same sheet", () => {
    const answers = realSheet();
    const vector = vectorOf(answers);

    expect(decodeAnswers(answers, vector)).toEqual(
      decodeAnswers([...answers].reverse(), vector),
    );
  });
});
