import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import QuizPage from "@/app/quiz/page";
import Quiz from "@/components/quiz/Quiz";
import AudienceStep from "@/components/quiz/AudienceStep";
import ContextStep from "@/components/quiz/ContextStep";
import Question from "@/components/quiz/Question";
import { AUDIENCE_QUESTION } from "@/lib/audience";
import { CONTEXT_HEADING } from "@/lib/context";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import {
  HIGHLIGHTED_QUESTION_IDS,
  QUESTION_HIGHLIGHTS,
  splitHighlighted,
} from "@/lib/personality/question-highlights";
import { scoreQuiz } from "@/lib/personality/scoring";

/**
 * Phase 1 — Gilded Editorial contract.
 *
 * The type roles, the marker wipe and the sparkle cursor are CSS-only, so
 * this suite checks the two halves separately: the rendered markup (real
 * button rows, one highlight span per screen, byte-identical copy) and the
 * rules in `app/globals.css` (font roles, hover choreography, wipe keyframes,
 * pointer:fine cursors, the reduced-motion freeze).
 */
const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Visible text with the markup stripped (see textOf in quiz-ui.test.tsx). */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

const noop = (): void => undefined;

/** A deterministic completed profile, through the REAL scorer. */
function computedResult() {
  return scoreQuiz(
    QUIZ_QUESTIONS.map((question) => ({
      questionId: question.id,
      optionId: question.options[0].id,
    })),
  );
}

describe("highlight phrases stay byte-exact substrings of the approved copy", () => {
  it("every question highlight occurs verbatim in its prompt", () => {
    expect(QUIZ_QUESTIONS).toHaveLength(10);
    for (const question of QUIZ_QUESTIONS) {
      const phrase = QUESTION_HIGHLIGHTS[question.id];
      expect(phrase, `no highlight for ${question.id}`).toBeDefined();
      expect(question.prompt, `highlight drift for ${question.id}`).toContain(
        phrase,
      );
      // One phrase per screen — never the whole prompt, never empty.
      expect(phrase.length).toBeGreaterThan(0);
      expect(phrase.length).toBeLessThan(question.prompt.length);
    }
  });

  it("audience, context and intro highlights occur verbatim in their copy", () => {
    expect(AUDIENCE_QUESTION).toContain(QUESTION_HIGHLIGHTS.audience);
    expect(CONTEXT_HEADING).toContain(QUESTION_HIGHLIGHTS.context);
    expect("عطر مناسب خودتون رو پیدا کنید").toContain(
      QUESTION_HIGHLIGHTS.intro,
    );
  });

  it("splitHighlighted wraps without altering a single character", () => {
    for (const question of QUIZ_QUESTIONS) {
      const parts = splitHighlighted(
        question.prompt,
        QUESTION_HIGHLIGHTS[question.id],
      );
      expect(parts).not.toBeNull();
      expect(parts![0] + parts![1] + parts![2]).toBe(question.prompt);
    }
  });
});

describe("marker-wipe renders with its highlight, copy untouched", () => {
  it("fires only on the allowlisted questions (Q1/Q5/Q10), plain elsewhere", () => {
    for (const question of QUIZ_QUESTIONS) {
      const html = render(<Question question={question} onSelect={noop} />);
      // The full approved prompt survives byte-identical, wipe or not.
      expect(textOf(html)).toContain(question.prompt);
      if (HIGHLIGHTED_QUESTION_IDS.has(question.id)) {
        expect(countOccurrences(html, 'class="marker-wipe"')).toBe(1);
        expect(
          countOccurrences(html, "marker-wipe is-inview"),
          "SSR must not pre-play the wipe",
        ).toBe(0);
      } else {
        expect(html).not.toContain("marker-wipe");
      }
    }
    // The allowlist is exactly the 1st, 5th and 10th questions in bank order.
    expect([...HIGHLIGHTED_QUESTION_IDS].sort()).toEqual(
      [QUIZ_QUESTIONS[0].id, QUIZ_QUESTIONS[4].id, QUIZ_QUESTIONS[9].id].sort(),
    );
  });

  it("fires on the intro headline but not on audience or context screens", () => {
    const audience = render(<AudienceStep onSelect={noop} />);
    expect(textOf(audience)).toContain(AUDIENCE_QUESTION);
    expect(audience).not.toContain("marker-wipe");

    const context = render(
      <ContextStep
        result={computedResult()}
        season={null}
        occasion={null}
        onSeasonChange={noop}
        onOccasionChange={noop}
        onBack={noop}
      />,
    );
    expect(textOf(context)).toContain(CONTEXT_HEADING);
    expect(context).not.toContain("marker-wipe");

    const intro = render(<Quiz />);
    expect(textOf(intro)).toContain("عطر مناسب خودتون رو پیدا کنید");
    expect(countOccurrences(intro, 'class="marker-wipe"')).toBe(1);
  });

  it("the wipe draws behind the text, right to left, sub-second", () => {
    expect(CSS).toContain(".marker-wipe::before {");
    expect(CSS).toContain("z-index: -1;");
    expect(CSS).toContain("transform-origin: right center;");
    expect(CSS).toContain("@keyframes marker-wipe-draw");
    expect(CSS).toContain("from {");
    expect(CSS).toContain("transform: scaleX(0);");
    // Sub-second: 550ms.
    expect(CSS).toContain("marker-wipe-draw 550ms");
  });
});

describe("option rows are real buttons in a number/label/arrow grid", () => {
  it("every option is a button with pressed-state semantics", () => {
    const question = QUIZ_QUESTIONS[0];
    const html = render(
      <Question
        question={question}
        selectedOptionId={question.options[1].id}
        onSelect={noop}
      />,
    );

    const buttons = html.match(/<button[^>]*data-option-id=/g) ?? [];
    expect(buttons).toHaveLength(question.options.length);
    expect(
      (html.match(/aria-pressed="true"/g) ?? []).length,
      "exactly the chosen row presses",
    ).toBe(1);
    expect(html).toContain('data-option-id="trusted"');
  });

  it("each row carries its Persian number, label and forward arrow", () => {
    const html = render(
      <Question question={QUIZ_QUESTIONS[0]} onSelect={noop} />,
    );
    expect(html).toContain("quiz-option-num");
    expect(html).toContain("quiz-option-label");
    expect(html).toContain("quiz-option-arrow");
    // Persian digits ۱ ۲ ۳ for the three options.
    expect(html).toContain("۱");
    expect(html).toContain("۲");
    expect(html).toContain("۳");
  });

  it("the hover choreography matches the brief's exact values", () => {
    expect(CSS).toContain(".quiz-option-row:hover {");
    // Row shifts 8px toward inline-end, 280ms ease.
    expect(CSS).toContain("transform: translateX(-8px);");
    expect(CSS).toContain("transform 280ms ease");
    // Label underlines at 3px offset; number + arrow darken to ink.
    expect(CSS).toContain("text-underline-offset: 3px;");
    expect(CSS).toContain("color: var(--foreground);");
    // Arrow slides a further 4px toward inline-end.
    expect(CSS).toContain("transform: translateX(-4px);");
    // Hover motion is gated to fine pointers.
    expect(CSS).toContain("@media (hover: hover) and (pointer: fine)");
  });
});

describe("type roles", () => {
  it("declares display, editorial and sans roles", () => {
    expect(CSS).toContain("--font-display:");
    expect(CSS).toContain("--font-editorial:");
    expect(CSS).toContain("--font-sans:");
    // Display reuses the heaviest licensed face; editorial the human voice.
    expect(CSS).toContain('"SG Kara"');
    expect(CSS).toContain('"Estedad"');
  });

  it("question titles use the display face at tight leading", () => {
    const html = render(
      <Question question={QUIZ_QUESTIONS[4]} onSelect={noop} />,
    );
    expect(html).toContain("font-display");
    expect(html).toContain("leading-[1.0]");
  });
});

describe("sparkle cursor", () => {
  it("applies original data-URI sparkles site-wide under pointer:fine", () => {    expect(CSS).toContain("@media (pointer: fine)");
    // Two data-URI artworks: ink by default, marker gold over interactives.
    expect(CSS).toContain('url("data:image/svg+xml,');
    expect((CSS.match(/url\("data:image\/svg\+xml,/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(CSS).toContain("%23d99a2b");
    // Native fallbacks only — never a hidden cursor (the token below is
    // spaced so this file's own comments cannot trip the assertion).
    expect(CSS).not.toMatch(/cursor:\s*none/u);
  });
});

describe("reduced-motion path", () => {
  it("freezes every Phase 1 addition, with the static highlight intact", () => {
    // The Phase 1 block: the reduced-motion query AFTER the marker base
    // rule (earlier queries belong to pre-existing layers).
    const markerBase = CSS.indexOf(".marker-wipe::before {");
    expect(markerBase).toBeGreaterThan(-1);
    const media = CSS.indexOf(
      "@media (prefers-reduced-motion: reduce)",
      markerBase,
    );
    expect(media).toBeGreaterThan(markerBase);
    const tail = CSS.slice(media);
    // The wipe never plays — and the base rule (before any media query) is
    // the finished highlight, so the gold stays put.
    expect(tail).toContain(".marker-wipe.is-inview::before");
    expect(tail).toContain("animation: none;");
    // Rows stop shifting; cursors fall back to native.
    expect(tail).toContain(".quiz-option-row");
    expect(tail).toContain("transition: none;");
    expect(tail).toContain("cursor: auto;");
    expect(tail).toContain("cursor: pointer;");
  });
});

describe("protected copy and tokens", () => {
  it("keeps the quiz title, footer line and centroid explainer untouched", () => {
    const quiz = render(<Quiz />);
    expect(textOf(quiz)).toContain("عطر مناسب خودتون رو پیدا کنید");
    expect(quiz).toContain("۱۰ سؤال");
  });

  it("adds no emoji and preserves the progress tokens", () => {
    const html = render(
      <Question question={QUIZ_QUESTIONS[0]} onSelect={noop} />,
    );
    expect(html).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(html).toContain("bg-accent/50");
  });
});

describe("question title breathes above the options", () => {
  it("gives the title-to-options gap real room on every question screen", () => {
    for (const question of QUIZ_QUESTIONS) {
      const html = render(<Question question={question} onSelect={noop} />);
      // 48px of breathing room on mobile and desktop alike; widths and
      // alignment are untouched. The room lives on the legend's margin — a
      // rendered <legend> is laid out specially and fieldset gap never
      // reaches it (measured 0px in the browser), so assert the margin, not
      // a gap the browser ignores.
      expect(html).toContain("mb-12 flex flex-col gap-3 p-0");
      expect(html).not.toContain("min-w-0 flex-col gap-12");
    }
    const audience = render(<AudienceStep onSelect={noop} />);
    expect(audience).toContain("mb-12 flex flex-col gap-3 p-0");
    expect(audience).not.toContain("min-w-0 flex-col gap-12");
  });
});

describe("desktop question column width", () => {
  it("keeps max-w-xl below lg and opens to max-w-5xl on desktop", async () => {
    const html = render(
      await QuizPage({ searchParams: Promise.resolve({}) }),
    );
    const main = html.match(/<main[^>]*>/)?.[0] ?? "";
    expect(main.length).toBeGreaterThan(0);
    // Below lg the column stays max-w-xl (mobile/tablet unchanged); on
    // desktop it opens to max-w-5xl (1024px) for the editorial composition.
    expect(main).toContain("max-w-xl");
    expect(main).toContain("lg:max-w-5xl");
    // The wider column stays a start-aligned flow — never centred content.
    expect(main).toContain("mx-auto");
    expect(main).not.toContain("text-center");
  });

  it("leaves the /result column at its historical width", () => {
    const resultPage = readFileSync(
      new URL("../../app/result/page.tsx", import.meta.url),
      "utf8",
    );
    expect(resultPage).not.toContain("lg:max-w-");
  });
});
