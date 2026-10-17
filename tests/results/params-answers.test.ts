import { describe, expect, it } from "vitest";

import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";
import {
  parseResultsParams,
  serializeResultsParams,
} from "@/lib/results/params";

/** A complete real sheet: first option everywhere. */
const realSheet = () =>
  QUIZ_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: question.options[0].id,
  }));

const searchOf = (href: string): Record<string, string> =>
  Object.fromEntries(new URL(href, "http://localhost").searchParams.entries());

describe("answer-sheet URL contract", () => {
  it("round-trips the recorded sheet losslessly", () => {
    const answers = realSheet();
    const scored = scoreQuiz(answers);

    const href = `/result?${serializeResultsParams(
      scored.vector,
      scored.archetype.id,
      undefined,
      undefined,
      "WOMEN",
      null,
      null,
      answers,
    )}`;
    const parsed = parseResultsParams(searchOf(href));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.answers).toEqual(answers);
      expect(parsed.value.audience).toBe("WOMEN");
    }
  });

  it("keeps legacy URLs byte-identical when no sheet travels", () => {
    const scored = scoreQuiz(realSheet());

    const without = serializeResultsParams(scored.vector, scored.archetype.id);
    const withEmpty = serializeResultsParams(
      scored.vector,
      scored.archetype.id,
      undefined,
      undefined,
      null,
      null,
      null,
      [],
    );

    expect(withEmpty).toBe(without);
    expect(without).not.toContain("answers=");

    const parsed = parseResultsParams(searchOf(`/result?${without}`));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.answers).toEqual([]);
    }
  });

  it("drops unknown pairs instead of failing the page", () => {
    const scored = scoreQuiz(realSheet());

    const href =
      `/result?${serializeResultsParams(scored.vector, scored.archetype.id)}` +
      `&answers=no-such-question%3Ano-such-option%2C${QUIZ_QUESTIONS[0].id}%3A${QUIZ_QUESTIONS[0].options[0].id}%2Cbroken-entry`;
    const parsed = parseResultsParams(searchOf(href));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.answers).toEqual([
        {
          questionId: QUIZ_QUESTIONS[0].id,
          optionId: QUIZ_QUESTIONS[0].options[0].id,
        },
      ]);
    }
  });

  it("never emits stale ids from a mismatched sheet", () => {
    const scored = scoreQuiz(realSheet());

    const href = `/result?${serializeResultsParams(
      scored.vector,
      scored.archetype.id,
      undefined,
      undefined,
      null,
      null,
      null,
      [
        { questionId: QUIZ_QUESTIONS[0].id, optionId: "stale-option" },
        ...realSheet(),
      ],
    )}`;
    const parsed = parseResultsParams(searchOf(href));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.answers).toEqual(realSheet());
    }
  });
});
