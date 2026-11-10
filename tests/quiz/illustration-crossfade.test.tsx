import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Question from "@/components/quiz/Question";
import {
  ILLUSTRATION_CROSSFADE_MS,
  illustrationLayers,
  initialIllustrationStage,
  loadedIllustration,
  navigateIllustration,
  settledIllustration,
  type IllustrationStage,
} from "@/lib/quiz/illustration-crossfade";
import {
  ILLUSTRATION_SIZES,
  illustrationPreloadFor,
} from "@/lib/quiz/illustration-preload";
import { QUESTION_ILLUSTRATIONS } from "@/lib/quiz/question-illustrations";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";

/**
 * Batch 28 — the page-turn crossfade between question illustrations.
 *
 * The transition is split in two, like the rest of the quiz suites: the pure
 * state machine decides WHICH layers may be painted and WHEN the fade is
 * allowed to start (load gate, two-layer cap, reduced motion), and the
 * stylesheet owns the 600ms opacity/scale itself. Neither half is a snapshot of
 * the visuals — every assertion is one of the brief's constraints.
 */

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const QUESTION_SOURCE = readFileSync(
  new URL("../../components/quiz/Question.tsx", import.meta.url),
  "utf8",
);
const WIDGET_SOURCE = readFileSync(
  new URL("../../components/widget/WidgetApp.tsx", import.meta.url),
  "utf8",
);

/** The full text of one `selector { … }` rule (brace-matched). */
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

const render = (element: ReactElement): string =>
  renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");

const noop = (): void => undefined;

/** The two motion preferences the component reads at event time. */
const animate = { reducedMotion: false };
const still = { reducedMotion: true };

const [first, second] = QUIZ_QUESTIONS;
const last = QUIZ_QUESTIONS[QUIZ_QUESTIONS.length - 1];

/** A screen that has already painted its own artwork. */
function painted(current: string): IllustrationStage {
  return loadedIllustration(initialIllustrationStage(current), current, animate);
}

describe("illustration crossfade — the load gate", () => {
  it("keeps the outgoing scene until the incoming artwork has loaded", () => {
    // Q1 is on screen; the shopper moves to Q2. The old scene stays exactly as
    // it was: nothing hides it, and nothing starts fading yet.
    let stage = painted(first.id);
    stage = navigateIllustration(stage, second.id, animate);

    expect(illustrationLayers(stage)).toEqual([first.id, second.id]);
    expect(stage.fading, "the fade must wait for the load event").toBe(false);
    expect(stage.loaded).toBeNull();

    // Only the load event may start the fade — and the old scene is still
    // underneath it while the new one comes in.
    stage = loadedIllustration(stage, second.id, animate);
    expect(stage.fading).toBe(true);
    expect(illustrationLayers(stage)).toEqual([first.id, second.id]);

    // The fade ends: now, and only now, the outgoing layer is removed.
    stage = settledIllustration(stage, second.id);
    expect(stage.fading).toBe(false);
    expect(illustrationLayers(stage)).toEqual([second.id]);
  });

  it("ignores a stale load from a layer that has already been replaced", () => {
    let stage = painted(first.id);
    stage = navigateIllustration(stage, second.id, animate);
    // The shopper clicks next again before Q2's artwork arrives.
    stage = navigateIllustration(stage, QUIZ_QUESTIONS[2].id, animate);
    const before = stage;

    // Q2 finishing late must not arm the fade for Q3.
    expect(loadedIllustration(stage, second.id, animate)).toBe(before);
    expect(stage.fading).toBe(false);
  });

  it("never stacks more than two layers, even under rapid next/back", () => {
    let stage = painted(first.id);
    let step = 0;

    // Walk the bank forwards then backwards, sometimes letting the artwork load
    // and sometimes interrupting it — the cap has to hold in every interleaving.
    const walk = [...QUIZ_QUESTIONS, ...[...QUIZ_QUESTIONS].reverse()];
    for (const question of walk) {
      stage = navigateIllustration(stage, question.id, animate);
      const layers = illustrationLayers(stage);
      expect(layers.length, "more than two layers stacked").toBeLessThanOrEqual(2);
      expect(new Set(layers).size, "the same scene stacked twice").toBe(layers.length);

      if (step % 3 === 0) {
        stage = loadedIllustration(stage, question.id, animate);
        expect(illustrationLayers(stage).length).toBeLessThanOrEqual(2);
      }
      if (step % 5 === 0) {
        stage = settledIllustration(stage, question.id);
        expect(illustrationLayers(stage).length).toBeLessThanOrEqual(2);
      }
      step += 1;
    }
  });

  it("swaps instantly, on one layer, under reduced motion", () => {
    let stage = loadedIllustration(initialIllustrationStage(first.id), first.id, still);
    stage = navigateIllustration(stage, second.id, still);

    // No stack and no scale: there is nothing to fade over.
    expect(illustrationLayers(stage)).toEqual([second.id]);
    stage = loadedIllustration(stage, second.id, still);
    expect(stage.fading).toBe(false);
    expect(illustrationLayers(stage)).toEqual([second.id]);
  });
});

describe("illustration crossfade — the motion", () => {
  it("is one 600ms opacity-and-scale fade on the incoming layer", () => {
    expect(ILLUSTRATION_CROSSFADE_MS).toBe(600);

    const swap = block(".quiz-illustration-layer--swap");
    expect(swap).toContain(
      `animation: quiz-illustration-swap ${ILLUSTRATION_CROSSFADE_MS}ms ease forwards;`,
    );

    // Only the two properties the brief allows: the scene fades in and settles
    // from a slight scale. Nothing here moves the stage.
    const keyframes = block("@keyframes quiz-illustration-swap");
    expect(keyframes).toContain("from {");
    expect(keyframes).toContain("opacity: 0;");
    expect(keyframes).toContain("transform: scale(1.04);");
    expect(keyframes).toContain("opacity: 1;");
    expect(keyframes).toContain("transform: scale(1);");

    // One-shot: declared once, never infinite.
    expect((CSS.match(/animation: quiz-illustration-swap/g) ?? []).length).toBe(1);
    expect(CSS).not.toContain("quiz-illustration-swap 600ms ease forwards infinite");
  });

  it("stacks the layers out of flow, so the stage box never moves", () => {
    const stage = block(".quiz-illustration");
    const layer = block(".quiz-illustration-layer");
    expect(stage).toContain("position: relative;");
    // The transition is not on the box: the stage itself never animates.
    expect(stage).not.toContain("animation");
    expect(layer).toContain("position: absolute;");
    expect(layer).toContain("inset: 0;");
  });

  it("is switched off entirely for reduced motion", () => {
    const reducedAt = CSS.indexOf(
      "@media (prefers-reduced-motion: reduce) {\n  .quiz-illustration-layer--swap",
    );
    expect(reducedAt, "no reduced-motion gate on the crossfade").toBeGreaterThan(-1);
    expect(CSS.slice(reducedAt)).toContain("animation: none;");
  });

  it("never loops, so the coarse-pointer ambience freeze is untouched", () => {
    // The freeze only silences the continuous ambience layers.
    const freeze = CSS.slice(CSS.indexOf("@media (pointer: coarse) {\n  .site-header {"));
    expect(freeze).not.toContain("quiz-illustration");
    // And this transition is not a continuous animation in the first place.
    expect(QUESTION_SOURCE).not.toContain("infinite");
  });
});

describe("illustration crossfade — the shared screen", () => {
  it("first mount renders one layer and no animation", () => {
    const html = render(<Question question={first} onSelect={noop} />);

    expect((html.match(/<img/g) ?? []).length).toBe(1);
    expect((html.match(/data-illustration-layer="current"/g) ?? []).length).toBe(1);
    expect(html).not.toContain('data-illustration-layer="outgoing"');
    expect(html).not.toContain("quiz-illustration-layer--swap");
    // Nothing underneath, so the one layer is visible from the first paint —
    // no blank stage waiting for hydration.
    expect(html).not.toContain("quiz-illustration-layer--pending");
  });

  it("is inherited by the widget: same component, no remount, no gate", () => {
    expect(WIDGET_SOURCE).toContain('import Question from "@/components/quiz/Question"');
    // A per-question key would remount the screen and silently deny the widget
    // the crossfade, so the widget must keep it mounted like the quiz does.
    expect(WIDGET_SOURCE).not.toContain("key={question.id}");
    expect(QUESTION_SOURCE).toContain("questionIllustrationFor(layerId)");

    // No prop turns the transition off: there is exactly one behaviour.
    const propsStart = QUESTION_SOURCE.indexOf("interface QuestionProps");
    const propsBlock = QUESTION_SOURCE.slice(
      propsStart,
      QUESTION_SOURCE.indexOf("\n}", propsStart),
    );
    for (const gate of ["crossfade", "disableIllustration", "animateIllustration"]) {
      expect(propsBlock, `a ${gate} prop would fork the behaviour`).not.toContain(gate);
    }
  });

  it("keeps every layer decorative, with one current layer", () => {
    const html = render(<Question question={second} onSelect={noop} />);
    expect(html).toContain('aria-hidden="true"');
    // The artwork never becomes content: the prompt carries the meaning.
    expect(html).toContain('alt=""');
    expect(html).not.toContain('role="img"');
  });
});

describe("illustration crossfade — the preload", () => {
  it("warms the next question's artwork, and nothing on the last screen", () => {
    const preload = illustrationPreloadFor(first.id);
    expect(preload, "the first question must preload the second").not.toBeNull();
    expect(preload!.sizes).toBe(ILLUSTRATION_SIZES);
    expect(preload!.src).toContain(encodeURIComponent(QUESTION_ILLUSTRATIONS[second.id]));
    expect(preload!.srcSet).toContain(encodeURIComponent(QUESTION_ILLUSTRATIONS[second.id]));

    // The last question has no successor.
    expect(illustrationPreloadFor(last.id)).toBeNull();
    // Nor does an id that is not in the bank.
    expect(illustrationPreloadFor("not-a-question")).toBeNull();
  });

  it("preloads exactly what the visible layer will request", () => {
    // Q1 warms Q2, so it is Q2's own layer that has to match that preload.
    const preload = illustrationPreloadFor(first.id);
    const html = render(<Question question={second} onSelect={noop} />);

    // Same `fill` + `sizes` configuration on both sides, so the preloaded
    // srcset is the one the browser picks the layer's candidate from.
    expect(html).toContain(preload!.srcSet.replaceAll("&", "&amp;"));
  });
});
