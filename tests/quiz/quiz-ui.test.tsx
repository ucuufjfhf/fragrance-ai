import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AudienceStep from "@/components/quiz/AudienceStep";
import ProgressBar from "@/components/quiz/ProgressBar";
import Question from "@/components/quiz/Question";
import Quiz from "@/components/quiz/Quiz";
import QuizResultCard from "@/components/quiz/QuizResultCard";
import { AUDIENCE_OPTIONS, AUDIENCE_QUESTION } from "@/lib/audience";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";

/**
 * Server-side render smoke tests.
 *
 * They need no browser and no jsdom: rendering to static markup proves the
 * components execute and emit the Persian copy, and the same shared engine
 * produces the result card content.
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Persian copy mixes zero-width non-joiners; comparing without them keeps the
 * assertions readable and immune to invisible-character differences.
 */
function withoutJoiners(value: string): string {
  return value.replace(/\u200c/g, "");
}

const noopSelect = (): void => undefined;
const noopRestart = (): void => undefined;

describe("quiz UI rendering", () => {
  it("renders the intro screen with Persian copy and a start button", () => {
    const html = render(<Quiz />);

    expect(html).toContain("عطر مناسب خودت رو پیدا کن");
    expect(html).toContain("شروع آزمون");
    expect(withoutJoiners(html)).toContain(
      withoutJoiners("نه یک تست روانشناسی"),
    );
  });

  it("renders a question screen with every option as a radio card", () => {
    const question = QUIZ_QUESTIONS[2];
    const html = render(<Question question={question} onSelect={noopSelect} />);

    expect(html).toContain(question.prompt);

    for (const option of question.options) {
      expect(html).toContain(option.label);
      expect(html).toContain(`value="${option.id}"`);
    }

    expect(html).toContain('type="radio"');
    expect(html).toContain(`name="${question.id}"`);
  });

  it("renders the progress label with Persian digits and a progressbar role", () => {
    const html = render(<ProgressBar current={3} total={10} />);

    expect(html).toContain("سؤال ۳ از ۱۰");
    expect(html).toContain("۳۰٪");
    expect(html).toContain('role="progressbar"');
  });

  it("renders the result card from a computed profile", () => {
    const result = scoreQuiz(
      QUIZ_QUESTIONS.map((question) => ({
        questionId: question.id,
        optionId: question.options[0].id,
      })),
    );

    const html = render(
      <QuizResultCard result={result} onRestart={noopRestart} />,
    );

    expect(html).toContain("پروفایل عطری تو");
    expect(html).toContain(result.archetype.label);
    expect(html).toContain(result.archetype.fragranceHint);
    expect(html).toContain("پروفایل شخصیتی تو");
    expect(html).toContain("شروع دوباره");
  });
});

describe("audience step rendering", () => {
  it("renders the approved question and both options as radio cards", () => {
    const html = render(<AudienceStep onSelect={noopSelect} />);

    expect(html).toContain(AUDIENCE_QUESTION);

    for (const option of AUDIENCE_OPTIONS) {
      expect(html).toContain(option.label);
      expect(html).toContain(`value="${option.id}"`);
    }

    expect(html).toContain('type="radio"');
    expect(html).toContain('name="audience"');
    // The audience screen is not a question: no «سؤال …» progress label.
    expect(html).not.toContain("سؤال");
  });

  it("keeps the audience selection visible when the shopper returns from Q1", () => {
    const selected = render(<AudienceStep selected="WOMEN" onSelect={noopSelect} />);
    const unselected = render(<AudienceStep selected={null} onSelect={noopSelect} />);

    expect(selected).toContain('value="WOMEN"');
    expect(selected).toContain('checked=""');
    expect(selected).not.toBe(unselected);
  });

  it("keeps the intro promising exactly 10 questions", () => {
    const html = render(<Quiz />);

    expect(withoutJoiners(html)).toContain(withoutJoiners("۱۰ سؤال"));
  });
});
