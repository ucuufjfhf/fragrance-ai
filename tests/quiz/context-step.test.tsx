import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ContextStep from "@/components/quiz/ContextStep";
import {
  CONTEXT_HEADING,
  NO_PREFERENCE_LABEL,
  OCCASION_OPTIONS,
  OCCASION_QUESTION,
  SEASON_OPTIONS,
  SEASON_QUESTION,
} from "@/lib/context";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";
import type { QuizResult } from "@/types/personality";

/**
 * Server-side render tests for the optional context step (same convention as
 * every other UI suite: react-dom/server, no jsdom, no browser).
 */

function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\\s\\S]*?-->/g, "");
}

/** Persian copy mixes zero-width non-joiners; compare without them. */
function withoutJoiners(value: string): string {
  return value.replace(/\u200c/g, "");
}

const result: QuizResult = scoreQuiz(
  QUIZ_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: question.options[0].id,
  })),
);

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe("context step rendering", () => {
  it("renders the approved heading and both optional questions", () => {
    const html = render(
      <ContextStep
        result={result}
        season={null}
        occasion={null}
        onSeasonChange={() => undefined}
        onOccasionChange={() => undefined}
        onBack={() => undefined}
      />,
    );

    expect(withoutJoiners(html)).toContain(withoutJoiners(CONTEXT_HEADING));
    expect(withoutJoiners(html)).toContain(withoutJoiners(SEASON_QUESTION));
    expect(withoutJoiners(html)).toContain(withoutJoiners(OCCASION_QUESTION));
    // The step announces itself as optional.
    expect(withoutJoiners(html)).toContain("اختیاریه");
  });

  it("renders every season and occasion option plus «فرقی نمی‌کنه» per group", () => {
    const html = render(
      <ContextStep
        result={result}
        season={null}
        occasion={null}
        onSeasonChange={() => undefined}
        onOccasionChange={() => undefined}
        onBack={() => undefined}
      />,
    );

    for (const option of SEASON_OPTIONS) {
      expect(html).toContain(option.label);
    }
    for (const option of OCCASION_OPTIONS) {
      expect(html).toContain(option.label);
    }

    // Exactly one explicit no-filter radio per group (the internal id is
    // shared) — never a third/fake option in either group.
    expect(countOccurrences(html, 'value="NONE"')).toBe(2);
    expect(
      countOccurrences(withoutJoiners(html), withoutJoiners(NO_PREFERENCE_LABEL)),
    ).toBeGreaterThanOrEqual(2);
  });

  it("builds a legacy results URL when no context is selected (tokens omitted)", () => {
    const html = render(
      <ContextStep
        result={result}
        season={null}
        occasion={null}
        onSeasonChange={() => undefined}
        onOccasionChange={() => undefined}
        onBack={() => undefined}
      />,
    );

    expect(html).toContain("href=");
    expect(html).not.toContain("season=");
    expect(html).not.toContain("occasion=");
    expect(html).toContain("archetype=");
  });

  it("serialises the selected season and occasion as URL tokens", () => {
    const html = render(
      <ContextStep
        result={result}
        storeId="store-merchant-x"
        audience="MEN"
        season="SUMMER"
        occasion="DATE"
        onSeasonChange={() => undefined}
        onOccasionChange={() => undefined}
        onBack={() => undefined}
      />,
    );

    expect(html).toContain("season=summer");
    expect(html).toContain("occasion=date");
    // Legacy parameters ride along unchanged.
    expect(html).toContain("target=men");
    expect(html).toContain("store=store-merchant-x");
    expect(html).toContain("archetype=");
  });

  it("renders the back action and the continue action", () => {
    const html = render(
      <ContextStep
        result={result}
        season={null}
        occasion={null}
        onSeasonChange={() => undefined}
        onOccasionChange={() => undefined}
        onBack={() => undefined}
      />,
    );

    expect(withoutJoiners(html)).toContain("قبلی");
    expect(withoutJoiners(html)).toContain("دیدن عطرهای پیشنهادی");
  });

  it("does not touch the personality result: the same vector and archetype travel through", () => {
    const html = render(
      <ContextStep
        result={result}
        season="AUTUMN"
        occasion="FORMAL"
        onSeasonChange={() => undefined}
        onOccasionChange={() => undefined}
        onBack={() => undefined}
      />,
    );

    // The URL still carries the scorer's own vector values and archetype.
    expect(html).toContain(`v_fresh=${result.vector.fresh}`);
    expect(html).toContain(`archetype=${result.archetype.id}`);
  });
});
