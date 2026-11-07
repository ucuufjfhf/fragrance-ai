import { describe, expect, it } from "vitest";

import {
  decodeAnswers,
  MAX_DECODED_ANSWERS,
} from "@/lib/personality/answer-decode";
import { PERSONALITY_LABELS } from "@/lib/personality/labels";
import { QUIZ_QUESTIONS, getOptionById } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";
import {
  PERSONALITY_DIMENSIONS,
  type PersonalityDimension,
  type PersonalityVector,
  type QuizAnswer,
} from "@/types/personality";

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

  it("cannot claim ۱۰۰٪ of an axis it only partly supplied", () => {
    // The old denominator dropped every answer already decoded for an earlier
    // axis, so the SECOND item could round to ۱۰۰٪ even though another answer
    // had pushed the same axis. Build exactly that case from real bank data:
    // answer A pushes axis x (decoded first) and also axis y; answer B pushes y.
    type Candidate = { answer: QuizAnswer; x: number; y: number };
    let found:
      | { a: Candidate; b: Candidate; x: PersonalityDimension; y: PersonalityDimension }
      | null = null;

    for (const x of PERSONALITY_DIMENSIONS) {
      for (const y of PERSONALITY_DIMENSIONS) {
        if (x === y) continue;

        for (const questionA of QUIZ_QUESTIONS) {
          for (const optionA of questionA.options) {
            const ax = optionA.vector[x] ?? 0;
            const ay = optionA.vector[y] ?? 0;
            if (ax <= 0 || ay <= 0) continue;

            for (const questionB of QUIZ_QUESTIONS) {
              if (questionB.id === questionA.id) continue;

              for (const optionB of questionB.options) {
                const by = optionB.vector[y] ?? 0;
                // B must push y, A must win x outright (so x decodes first),
                // and B's share of y must stay clearly below 100٪ so the
                // assertion does not ride on rounding.
                if (by <= 0 || (optionB.vector[x] ?? 0) >= ax) continue;
                if (by * 10 > ay * 9 + by) continue;

                found = {
                  a: { answer: { questionId: questionA.id, optionId: optionA.id }, x: ax, y: ay },
                  b: { answer: { questionId: questionB.id, optionId: optionB.id }, x: 0, y: by },
                  x,
                  y,
                };
                break;
              }
              if (found) break;
            }
            if (found) break;
          }
          if (found) break;
        }
        if (found) break;
      }
      if (found) break;
    }

    expect(found).not.toBeNull();
    const { a, b, x, y } = found!;

    const vector = Object.fromEntries(
      PERSONALITY_DIMENSIONS.map((dimension) => [dimension, 0]),
    ) as PersonalityVector;
    vector[x] = 100;
    vector[y] = 90;

    const decoded = decodeAnswers([a.answer, b.answer], vector, QUIZ_QUESTIONS, 2);

    expect(decoded.map((item) => item.dimension)).toEqual([x, y]);
    expect(decoded[0].questionId).toBe(a.answer.questionId);

    // Honest denominator: the axis's push across BOTH answers. The old code
    // divided by b.y alone and showed ۱۰۰٪ here.
    expect(decoded[1].share).toBeCloseTo(b.y / (a.y + b.y), 2);
    expect(decoded[1].share).toBeLessThan(1);
  });
});
