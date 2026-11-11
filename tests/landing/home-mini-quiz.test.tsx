import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";
import { MINI_QUIZ_PARAM } from "@/lib/personality/quiz-flow";
import { getQuestionById } from "@/lib/personality/questions";

/**
 * Batch 38 — Q1 answered in the hero.
 *
 * The block must be the bank's own question, never a copy: the prompt and the
 * three labels are compared against `getQuestionById("choice-style")`, and the
 * page sources are checked for any retyped copy of them. The rest of the hero —
 * H1, subcopy, caption, bottle, bloom, bottom CTA — is pinned unchanged.
 */

const PAGE_SOURCE = readFileSync(
  new URL("../../app/page.tsx", import.meta.url),
  "utf8",
);
const HERO_SOURCE = readFileSync(
  new URL("../../components/landing/HeroMiniQuiz.tsx", import.meta.url),
  "utf8",
);

/** Both modules with their block comments stripped: prose may name things the
 * code must not use (e.g. the analytics event the hero must never fire). */
const PAGE_CODE = PAGE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "");
const HERO_CODE = HERO_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "");

const render = (): string =>
  renderToStaticMarkup(<Home />).replace(/<!--[\s\S]*?-->/g, "");

const question = getQuestionById("choice-style")!;

const SUBCOPY =
  "فقط ۱۰ سوال کوتاه؛ بعدش می‌فهمید کدوم رایحه واقعاً به سلیقه و شخصیتتون می‌خوره — نه بر اساس تبلیغ، بر اساس خودتون.";
const CAPTION = "حدود دو دقیقه وقت می‌گیره · بدون ثبت‌نام";
const BOTTLE = encodeURIComponent("/hero/fiage-hero-bottle.webp");
const SHADOW_CLASS =
  "absolute inset-x-10 bottom-1 h-8 rounded-[100%] bg-black/25 blur-2xl";

/** The hero H1 exactly as SSR emits it. */
function heroH1(html: string): string {
  const start = html.indexOf("<h1");
  expect(start, "the homepage has no h1").toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</h1>", start) + "</h1>".length);
}

describe("homepage mini-quiz — Q1 in the hero", () => {
  const html = render();

  it("renders Q1's prompt and all three options verbatim from the bank", () => {
    expect(question.id).toBe("choice-style");
    expect(question.options.map((option) => option.id)).toEqual([
      "trusted",
      "ask-others",
      "explore",
    ]);

    expect(html).toContain(question.prompt);
    for (const option of question.options) {
      expect(html).toContain(option.label);
    }
  });

  it("makes every option a link to /quiz carrying its own id", () => {
    for (const option of question.options) {
      expect(html).toContain(`href="/quiz?${MINI_QUIZ_PARAM}=${option.id}"`);
      expect(html).toContain(`data-option-id="${option.id}"`);
    }

    // Exactly three carried links, all on the same bank question.
    expect(html.match(/href="\/quiz\?q1=/g) ?? []).toHaveLength(3);
    expect(html.match(new RegExp(`data-question-id="${question.id}"`, "g")) ?? []).toHaveLength(3);
  });

  it("sits in the hero's copy column, under the subcopy and above the CTA", () => {
    const subcopyAt = html.indexOf(SUBCOPY);
    const promptAt = html.indexOf(question.prompt);
    // The header also links /quiz, so anchor the hero's own button after the
    // prompt rather than taking the page's first match.
    const ctaAt = html.indexOf('href="/quiz">شروع آزمون', promptAt);

    expect(subcopyAt).toBeGreaterThan(-1);
    expect(promptAt).toBeGreaterThan(subcopyAt);
    expect(ctaAt).toBeGreaterThan(promptAt);
    // The mini-quiz and the CTA are in the same column, in that order.
    expect(html.slice(promptAt, ctaAt)).toContain(`data-option-id="${question.options[2].id}"`);
  });

  it("never retypes the question: the hero reads it from the bank", () => {
    expect(PAGE_SOURCE).toContain(
      'import HeroMiniQuiz from "@/components/landing/HeroMiniQuiz"',
    );
    expect(HERO_SOURCE).toContain(
      'import { getQuestionById } from "@/lib/personality/questions"',
    );
    expect(HERO_SOURCE).toContain("getQuestionById(MINI_QUIZ_QUESTION_ID)");

    // The copy exists once, in the bank — not in either page module.
    expect(HERO_CODE).not.toContain(question.prompt);
    expect(PAGE_CODE).not.toContain(question.prompt);
    for (const option of question.options) {
      expect(HERO_CODE).not.toContain(option.label);
      expect(PAGE_CODE).not.toContain(option.label);
    }
  });

  it("stays a server component and fires nothing itself", () => {
    // No client bundle for three anchors…
    expect(HERO_CODE).not.toContain('"use client"');
    // …no analytics from the hero or the homepage (the quiz fires it on
    // arrival instead), and no client-side storage at all.
    for (const code of [PAGE_CODE, HERO_CODE]) {
      expect(code).not.toMatch(/trackQuizStarted|trackEvent|QUIZ_STARTED/);
      expect(code).not.toMatch(/sessionStorage|localStorage/);
    }
  });
});

describe("homepage mini-quiz — the hero the rest of the page pins", () => {
  const html = render();

  it("keeps the H1 byte-identical and its copy intact", () => {
    const h1 = heroH1(html);

    expect(h1).toBe(
      '<h1 class="font-heading text-4xl font-bold leading-[1.3] text-foreground sm:text-5xl lg:text-6xl">' +
        '<span class="block">عطر <span class="marker-wipe">خودتون</span> رو</span> ' +
        '<span class="block">پیدا کنید</span></h1>',
    );
    // Still one wipe on the whole page: the mini-quiz adds none.
    expect(html.match(/class="marker-wipe/g) ?? []).toHaveLength(1);
  });

  it("keeps the subcopy and the two-minute caption word for word", () => {
    expect(html).toContain(SUBCOPY);
    expect(html).toContain(CAPTION);
  });

  it("keeps the bottle, its bloom and its ground shadow untouched", () => {
    expect(html).toContain(BOTTLE);
    expect(html).toContain("object-contain");
    expect(html).toContain(SHADOW_CLASS);
    expect(html).toContain("radial-gradient(58% 46% at 50% 42%");
    expect(html).toContain("radial-gradient(closest-side");
    // Exactly the batch-33 pair of decorative bloom layers.
    expect(
      html.match(
        /aria-hidden="true" class="pointer-events-none absolute(?: inset-x-0| right-\[4%\])/g,
      ) ?? [],
    ).toHaveLength(2);
    expect(html.match(/bg-black\/25 blur-2xl/g) ?? []).toHaveLength(1);
  });

  it("keeps the no-answer path and the bottom trust-line CTA", () => {
    // The hero's «شروع آزمون» is still a plain /quiz link — a fresh quiz with
    // no pre-answer — and it keeps the approved primary-button styling.
    const promptAt = html.indexOf(question.prompt);
    const heroSlice = html.slice(promptAt, html.indexOf("</section>", promptAt));
    expect(heroSlice).toContain('href="/quiz">شروع آزمون');
    expect(heroSlice).toContain("min-h-14 items-center justify-center px-9 text-lg font-medium");

    // The closing trust line is untouched: the same sentence and CTA.
    const trust = html.slice(html.indexOf("بدون حدس و گمان"));
    expect(trust).toContain("شروع آزمون");
    expect(trust).toContain('href="/quiz"');
  });
});
