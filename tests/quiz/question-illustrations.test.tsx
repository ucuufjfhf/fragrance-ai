import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Question from "@/components/quiz/Question";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import {
  QUESTION_ILLUSTRATIONS,
  questionIllustrationFor,
} from "@/lib/quiz/question-illustrations";

function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

const noop = (): void => undefined;

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** Assets must stay small enough for a mid-range phone on 4G. */
const MAX_ILLUSTRATION_BYTES = 150 * 1024;

/**
 * The one stage contract: the artwork's own 3:2 aspect at full width, capped and
 * centred on wide screens — identical on all ten questions.
 */
const STAGE_CLASSES =
  "quiz-illustration relative aspect-[3/2] w-full overflow-hidden rounded-2xl sm:mx-auto sm:max-w-[640px]";

describe("question illustrations", () => {
  it("covers every question in the bank, keyed by question id", () => {
    expect(QUIZ_QUESTIONS).toHaveLength(10);
    expect(Object.keys(QUESTION_ILLUSTRATIONS)).toHaveLength(10);
    for (const question of QUIZ_QUESTIONS) {
      expect(
        questionIllustrationFor(question.id),
        `question ${question.id} has no illustration`,
      ).toBeDefined();
    }
    // No orphan entries pointing at questions that do not exist.
    const ids = new Set(QUIZ_QUESTIONS.map((question) => question.id));
    for (const id of Object.keys(QUESTION_ILLUSTRATIONS)) {
      expect(ids.has(id), `illustration entry ${id} matches no question`).toBe(
        true,
      );
    }
  });

  it("maps to real self-hosted webp files within the size budget", () => {
    let checked = 0;
    for (const [id, src] of Object.entries(QUESTION_ILLUSTRATIONS)) {
      expect(id.length, "illustration entry has an empty id").toBeGreaterThan(0);
      expect(src.startsWith("/quiz/")).toBe(true);
      expect(src.endsWith(".webp")).toBe(true);
      const file = join(process.cwd(), "public", src.replace(/^\//, ""));
      expect(existsSync(file), `${src} is missing from public/`).toBe(true);
      const size = statSync(file).size;
      expect(
        size,
        `${src} is ${size} bytes, over the ${MAX_ILLUSTRATION_BYTES} budget`,
      ).toBeLessThanOrEqual(MAX_ILLUSTRATION_BYTES);
      checked += 1;
    }
    expect(checked).toBe(10);
  });

  it("renders one frameless full-scene stage above the prompt", () => {
    const stages = new Set<string>();

    for (const question of QUIZ_QUESTIONS) {
      const html = render(<Question question={question} onSelect={noop} />);
      const src = QUESTION_ILLUSTRATIONS[question.id];
      // next/image URL-encodes the src (%2F…), so match the encoded form.
      expect(html).toContain(src.replaceAll("/", "%2F"));

      // Exactly one drawing per screen, and it is decorative: empty alt and
      // hidden from assistive tech.
      expect(html.match(/<img/g)?.length ?? 0).toBe(1);
      expect(html).toContain('alt=""');
      expect(html).toContain('aria-hidden="true"');

      // The art is a full scene with its own background, so it is cover-fitted
      // into the scene band — never letterboxed with contain.
      expect(html).toContain("object-cover");
      expect(html).toContain("object-center");
      expect(html).not.toContain("object-contain");

      // The stage takes the scene's own 3:2 aspect, so the whole approved
      // artwork is shown: no fixed pixel band and no focus framing may creep
      // back in, or the bottle would be cropped again.
      expect(html).toContain("aspect-[3/2]");
      expect(html).not.toMatch(/h-\[\d+px\]/);
      expect(html).not.toContain("object-position");

      // The stage is a clipped scene panel at the site's small media radius:
      // no background, border or shadow of its own.
      const stage = html.match(/<div[^>]*class="quiz-illustration[^"]*"[^>]*>/)?.[0];
      expect(stage, "missing illustration stage").toBeDefined();
      expect(stage).toContain(`class="${STAGE_CLASSES}"`);
      expect(stage).toContain("overflow-hidden");
      expect(stage).toContain("rounded-2xl");
      for (const ban of ["shadow", "border", "bg-", "style="]) {
        expect(stage, `stage must not carry ${ban}`).not.toContain(ban);
      }
      stages.add(stage!);

      // The stage sits above the prompt headline.
      expect(html.indexOf("quiz-illustration")).toBeLessThan(
        html.indexOf("<legend"),
      );

      // Options remain text rows: no image inside any answer button.
      const buttons = html.split("<button").slice(1);
      expect(buttons).toHaveLength(question.options.length);
      for (const button of buttons) {
        expect(button).not.toContain("<img");
      }
    }

    // One identical stage across all ten questions, so the layout never jumps
    // while navigating.
    expect(stages.size).toBe(1);
  });

  it("keeps the fade on question change, static for reduced motion", () => {
    expect(CSS).toContain(".quiz-illustration {");
    expect(CSS).toContain("animation: quiz-illustration-fade 450ms ease-out;");
    expect(CSS).toContain("@keyframes quiz-illustration-fade");
    const reduced = CSS.slice(
      CSS.indexOf("@media (prefers-reduced-motion: reduce)", CSS.indexOf(".quiz-illustration {")),
    );
    expect(reduced).toContain(".quiz-illustration");
    expect(reduced).toContain("animation: none;");
    // The retired photo band is gone from the stylesheet entirely.
    expect(CSS).not.toContain("quiz-photo-band");
  });
});
