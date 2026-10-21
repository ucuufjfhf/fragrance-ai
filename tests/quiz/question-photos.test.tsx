import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Question from "@/components/quiz/Question";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import {
  QUESTION_PHOTO_FOCUS,
  QUESTION_PHOTOS,
  questionPhotoFocusFor,
  questionPhotoFor,
} from "@/lib/quiz/question-photos";

function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

const noop = (): void => undefined;

/** Assets must stay small enough for a mid-range phone on 4G. */
const MAX_PHOTO_BYTES = 150 * 1024;

describe("question atmosphere photos", () => {
  it("covers every question in the bank, keyed by question id", () => {
    expect(QUIZ_QUESTIONS).toHaveLength(10);
    for (const question of QUIZ_QUESTIONS) {
      expect(
        questionPhotoFor(question.id),
        `question ${question.id} has no atmosphere photo`,
      ).toBeDefined();
    }
    // No orphan entries pointing at questions that do not exist.
    const ids = new Set(QUIZ_QUESTIONS.map((question) => question.id));
    for (const id of Object.keys(QUESTION_PHOTOS)) {
      expect(ids.has(id), `photo entry ${id} matches no question`).toBe(true);
    }
  });

  it("maps to real self-hosted webp files within the size budget", () => {
    for (const [id, src] of Object.entries(QUESTION_PHOTOS)) {
      expect(id.length, "photo entry has an empty id").toBeGreaterThan(0);
      expect(src.startsWith("/quiz/")).toBe(true);
      expect(src.endsWith(".webp")).toBe(true);
      const file = join(process.cwd(), "public", src.replace(/^\//, ""));
      expect(existsSync(file), `${src} is missing from public/`).toBe(true);
      const size = statSync(file).size;
      expect(
        size,
        `${src} is ${size} bytes, over the ${MAX_PHOTO_BYTES} budget`,
      ).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
    }
  });

  it("frames the one low-subject photo, centring the rest", () => {
    const ids = new Set(QUIZ_QUESTIONS.map((question) => question.id));
    for (const id of Object.keys(QUESTION_PHOTO_FOCUS)) {
      expect(ids.has(id), `focus entry ${id} matches no question`).toBe(true);
    }

    // `risk` is a portrait mountain where the peak sits low: a centred 21:9
    // crop would be almost all empty sky, so it is framed below centre.
    expect(questionPhotoFocusFor("risk")).toBe("50% 65%");
    expect(questionPhotoFocusFor("colors")).toBe("50% 50%");

    const risk = QUIZ_QUESTIONS.find((question) => question.id === "risk");
    if (!risk) throw new Error("risk question is missing");
    expect(render(<Question question={risk} onSelect={noop} />)).toContain(
      "object-position",
    );
  });

  it("renders the band above the prompt while options stay text-only", () => {
    for (const question of QUIZ_QUESTIONS) {
      const html = render(<Question question={question} onSelect={noop} />);
      const src = QUESTION_PHOTOS[question.id];
      // next/image URL-encodes the src (%2F…), so match the encoded form.
      const encoded = src.replaceAll("/", "%2F");
      expect(html).toContain(encoded);

      // Exactly one photo per screen, and it is decorative: empty alt and
      // hidden from assistive tech.
      expect(html.match(/<img/g)?.length ?? 0).toBe(1);
      expect(html).toContain('alt=""');

      // Options remain text rows: no image inside any answer button.
      const buttons = html.split("<button").slice(1);
      expect(buttons).toHaveLength(question.options.length);
      for (const button of buttons) {
        expect(button).not.toContain("<img");
      }
    }
  });
});
