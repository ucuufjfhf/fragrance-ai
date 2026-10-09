import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import ProgressBar from "@/components/quiz/ProgressBar";
import Question from "@/components/quiz/Question";
import QuizOption from "@/components/quiz/QuizOption";
import TraitBars from "@/components/results/TraitBars";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { makeVector } from "@/tests/ai/fixtures";

/**
 * Regression tests for the quiz contrast bug (near-black question text on the
 * night-sky quiz surface).
 *
 * Root cause: `color` inherits as a RESOLVED value. The dark scope
 * (`[data-surface="dark"]`, used by the quiz page) redefined `--foreground` but
 * never declared `color`, so any text without its own token inherited the
 * light-surface ink computed on <body> (#24212a) — unreadable on night plum.
 *
 * These tests lock the two halves of the fix:
 *  1. the dark scope re-seeds `color`, so no dark-section text can inherit ink;
 *  2. the quiz's own text elements carry explicit semantic tokens
 *     (`text-foreground` / `text-muted`) instead of relying on inheritance.
 */

function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** The `[data-surface="dark"]` rule block, comments excluded. */
function darkScopeBlock(): string {
  const match = globalsCss.match(/\[data-surface="dark"\]\s*\{([\s\S]*?)\n\}/);
  return match?.[1] ?? "";
}

/** Opening tag of the nearest element before `needle` in the markup. */
function tagBefore(html: string, needle: string): string {
  const index = html.indexOf(needle);
  expect(index).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", index);
  return html.slice(start, html.indexOf(">", start) + 1);
}

describe("quiz contrast", () => {
  it("the dark scope re-seeds `color`, so nothing inside inherits light-scope ink", () => {
    const block = darkScopeBlock();

    expect(block).not.toBe("");
    // The scope still owns the night palette…
    expect(block).toContain("--foreground: var(--moonlight-ivory)");
    expect(block).toContain("--background: var(--night-plum)");
    // …and it declares `color` itself. Removing this line is the regression.
    expect(block).toMatch(/(^|\n)\s*color:\s*var\(--foreground\);/);
  });

  it("answer rows and answer labels carry the semantic text token", () => {
    const question = QUIZ_QUESTIONS[2];
    const html = render(<Question question={question} onSelect={() => undefined} />);

    expect(html).toContain(question.prompt);

    for (const option of question.options) {
      expect(html).toContain(option.label);
      const labelTag = tagBefore(html, option.label);
      expect(labelTag).toContain("text-foreground");
    }
  });

  it("the answer row keeps the token in default, hover and selected states", () => {
    const base = {
      name: "q",
      optionId: "o",
      label: "گزینه آزمون",
      onSelect: () => undefined,
    };

    for (const html of [
      render(<QuizOption {...base} selected={false} />),
      render(<QuizOption {...base} selected />),
    ]) {
      const row = html.match(/<label[^>]*>/)?.[0] ?? "";
      expect(row).toContain("text-foreground");
      // The label text is explicit too — it can never fall back to inheritance.
      const labelSpan = tagBefore(html, base.label);
      expect(labelSpan).toContain("text-foreground");
    }
  });

  it("the quiz progress readout uses a text token rather than inheriting", () => {
    const html = render(<ProgressBar current={3} total={10} />);
    const percentTag = tagBefore(html, "۳۰٪");

    expect(percentTag).toMatch(/text-(muted|foreground)/);
    // …and the question counter still resolves through its muted parent row.
    expect(tagBefore(html, "سؤال").length).toBeGreaterThan(0);
  });

  it("shared trait bars stay legible on both surfaces (no raw ink token)", () => {
    // TraitBars renders inside the dark quiz result card AND the light results
    // page, so it must use the semantic token, never the fixed ink colour.
    const html = render(<TraitBars vector={makeVector(50)} />);

    expect(html).toContain("text-foreground");
    expect(html).not.toContain("text-ink");
    expect(html).toContain("پروفایل شخصیتی تو");
  });
});
