import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BottleSilhouettes, {
  MAX_QUIZ_SILHOUETTES,
  SILHOUETTE_MAX_OPACITY,
  SILHOUETTE_MIN_OPACITY,
} from "@/components/BottleSilhouettes";
import QuizAmbience from "@/components/quiz/QuizAmbience";
import RecommendationCard from "@/components/results/RecommendationCard";
import { makeMatchResult } from "@/tests/ai/fixtures";

/**
 * Bottle silhouettes contract.
 *
 * The bottles are decoration: they are DEPTH in the background and never the
 * artwork of a recommendation (the cards use `lib/perfumes/artwork.ts`). Both
 * halves of that are load-bearing, so both are locked here:
 *  - the markup side — how many shapes, how faint, inert, static, and behind the
 *    other ambience layers;
 *  - the CSS side — the rules that turn a photo into a ghost of glass;
 *  - and the one negative that matters: a recommendation card references no
 *    bottle file at all.
 *
 * Every assertion is one of the brief's hard constraints rather than a snapshot
 * of the visuals, so a future edit that breaks one fails loudly.
 */

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
);

/** The full text of one `selector { … }` rule (brace-matched, no nesting). */
function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `rule not found: ${selector}`).toBeGreaterThan(-1);

  let depth = 0;
  for (let index = CSS.indexOf("{", start); index < CSS.length; index += 1) {
    if (CSS[index] === "{") depth += 1;
    if (CSS[index] === "}") {
      depth -= 1;
      if (depth === 0) return CSS.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated rule: ${selector}`);
}

const quiz = renderToStaticMarkup(<QuizAmbience />).replace(/<!--[\s\S]*?-->/g, "");
const accent = renderToStaticMarkup(<BottleSilhouettes variant="accent" />).replace(
  /<!--[\s\S]*?-->/g,
  "",
);

/** Every `--silhouette-opacity` the markup declares, as numbers. */
const opacities = (html: string): number[] =>
  [...html.matchAll(/--silhouette-opacity:([\d.]+)/g)].map(([, value]) => Number(value));

describe("bottle silhouettes markup", () => {
  it("renders three shapes for the quiz and exactly one for the results accent", () => {
    expect(MAX_QUIZ_SILHOUETTES).toBeGreaterThanOrEqual(2);
    expect(MAX_QUIZ_SILHOUETTES).toBeLessThanOrEqual(3);
    expect((quiz.match(/class="bottle-silhouette"/g) ?? []).length).toBe(MAX_QUIZ_SILHOUETTES);
    expect((accent.match(/class="bottle-silhouette"/g) ?? []).length).toBe(1);
  });

  it("stays in the barely-there 0.05–0.08 band", () => {
    const quizOpacities = opacities(quiz);
    expect(quizOpacities).toHaveLength(MAX_QUIZ_SILHOUETTES);

    for (const opacity of [...quizOpacities, ...opacities(accent)]) {
      expect(opacity).toBeGreaterThanOrEqual(SILHOUETTE_MIN_OPACITY);
      expect(opacity).toBeLessThanOrEqual(SILHOUETTE_MAX_OPACITY);
    }
    // Depth, not decoration: even the boldest shape is still under a tenth.
    expect(Math.max(...quizOpacities)).toBeLessThan(0.1);
  });

  it("anchors every quiz shape at a viewport edge", () => {
    // Each shape hangs off an edge, so the frame is cropped by the viewport and
    // can never read as a framed picture. (Scoped to the layer: the glow orbs
    // carry their own inline `left`/`top` further down the markup.)
    const layer = quiz.slice(quiz.indexOf("bottle-silhouette-layer"), quiz.indexOf("quiz-wash"));
    const anchors = [...layer.matchAll(/(left|right):(-?\d+)%/g)].map(([, side, value]) => ({
      side,
      value: Number(value),
    }));

    expect(anchors).toHaveLength(MAX_QUIZ_SILHOUETTES);
    for (const { value } of anchors) {
      expect(value, "a shape inside the viewport would read as an object").toBeLessThan(0);
    }
    // …and both edges are used, so the field reads as a rhythm, not a column.
    expect(new Set(anchors.map(({ side }) => side))).toEqual(new Set(["left", "right"]));
  });

  it("is decorative and inert: hidden from assistive tech, no pointer target, no copy", () => {
    for (const html of [quiz, accent]) {
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain("pointer-events-none");
      // No text at all inside the layer, and nothing to translate.
      expect(html).not.toMatch(/[^\x00-\x7F]/);
    }

    const layer = quiz.slice(quiz.indexOf("bottle-silhouette-layer"), quiz.indexOf("quiz-wash"));
    expect(layer).not.toMatch(/>[^<]/);
  });

  it("paints behind the washes — and therefore behind every other ambience layer", () => {
    // DOM order within `.quiz-ambience` is the whole contract: the silhouettes are
    // declared first, the washes next, the orb layer after them, and everything
    // the flow adds (ink blooms, fog, motes, spray) sits above this container.
    const silhouetteLayer = quiz.indexOf("bottle-silhouette-layer");
    expect(silhouetteLayer).toBeGreaterThan(-1);
    expect(silhouetteLayer).toBeLessThan(quiz.indexOf("quiz-wash-a"));
    expect(quiz.indexOf("quiz-wash-a")).toBeLessThan(quiz.indexOf("quiz-orb-layer"));
    expect(quiz.indexOf("quiz-orb-layer")).toBeLessThan(quiz.indexOf("quiz-grain"));
  });

  it("points at bottle files that actually exist", () => {
    for (const [, source] of quiz.matchAll(/url\((\/perfumes\/bottles\/[^)]+)\)/g)) {
      expect(existsSync(new URL(`../../public${source}`, import.meta.url)), source).toBe(true);
    }
    for (const [, source] of accent.matchAll(/url\((\/perfumes\/bottles\/[^)]+)\)/g)) {
      expect(existsSync(new URL(`../../public${source}`, import.meta.url)), source).toBe(true);
    }
  });
});

describe("bottle silhouette CSS", () => {
  it("composites the photo over the page cream, so only the glass shows", () => {
    const shape = block(".bottle-silhouette");

    // The trick: the photo's cream ground is cancelled against the page cream
    // instead of being pasted on top of it.
    expect(shape).toContain("background-color: var(--background);");
    expect(shape).toContain("background-blend-mode: multiply;");
    expect(shape).toContain("background-size: cover;");
    // A neutral shadow rather than a photo, with the hard edges taken off.
    expect(shape).toMatch(/filter: grayscale\(1\)[^;]*contrast\([\d.]+\)[^;]*blur\([\d.]+px\)/);
    // Palette-only: the element declares no colour of its own.
    expect(shape).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // The faintness knob, with the component's value winning.
    expect(shape).toContain("opacity: var(--silhouette-opacity, 0.06);");
  });

  it("keeps the 16:10 frame of the source art", () => {
    expect(block(".bottle-silhouette")).toContain("aspect-ratio: 16 / 10;");
  });

  it("is static: nothing to freeze under prefers-reduced-motion", () => {
    for (const selector of [
      ".bottle-silhouette-layer",
      ".bottle-silhouette-backdrop",
      ".bottle-silhouette",
    ]) {
      const rule = block(selector);
      expect(rule, `${selector} must not animate`).not.toContain("animation");
      expect(rule).not.toContain("transition");
    }

    // Inert by construction: both layers are `pointer-events: none`, so the
    // shapes inside them inherit it and can never intercept a click.
    for (const selector of [".bottle-silhouette-layer", ".bottle-silhouette-backdrop"]) {
      expect(block(selector), selector).toContain("pointer-events: none;");
    }

    // …and no keyframes were introduced for them either.
    expect(CSS).not.toContain("@keyframes bottle");
  });

  it("places the results accent in a fixed backdrop behind the content", () => {
    const backdrop = block(".bottle-silhouette-backdrop");
    expect(backdrop).toContain("position: fixed;");
    expect(backdrop).toContain("z-index: -10;");
    // Off-screen shapes must never create a scrollbar.
    expect(backdrop).toContain("overflow: hidden;");
  });
});

describe("the bottles are not product art", () => {
  it("keeps every recommendation card on the abstract artwork", () => {
    const recommendation = makeMatchResult().recommendations[0];
    expect(recommendation.imageUrl).toBeNull();

    const card = renderToStaticMarkup(<RecommendationCard recommendation={recommendation} />);

    // The card's panel is the bundled abstract artwork…
    expect(card).toMatch(/\/perfumes\/perfume-0[1-6]\.jpg/);
    // …and a bottle never appears on it.
    expect(card).not.toContain("/perfumes/bottles/");
  });
});
