import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ProgressBar from "@/components/quiz/ProgressBar";
import Question from "@/components/quiz/Question";
import QuizAtmosphere, {
  ARC_GOLD_FLOOR_OPACITY,
  ARC_GOLD_START_OPACITY,
  ARC_WINE_CAP_OPACITY,
  FOG_START_OPACITY,
  arcWashOpacities,
} from "@/components/quiz/QuizAtmosphere";
import { toPersianDigits } from "@/lib/persian";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";

/**
 * Quiz beauty pass — numeral, light arc, selection moment, progress marker.
 *
 * Three of the four treatments are CSS, so this suite checks both halves like
 * its siblings do: the rendered markup (the watermark, the arc layer, the
 * sparkle) and the rules in `app/globals.css` that make them what they are (the
 * gold recipe, the one-shot ring, the reduced-motion gates, the selection
 * sparkle).
 *
 * Nothing is a snapshot of the visuals: every assertion is one of the brief's
 * constraints, plus the contrast envelope the arc must not break.
 */

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const QUIZ_SOURCE = readFileSync(
  new URL("../../components/quiz/Quiz.tsx", import.meta.url),
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

/**
 * Whether a rule is declared at the top level of the stylesheet — i.e. not
 * inside a media query. That is how "present under reduced motion" is proven:
 * a static style has to be unconditional.
 */
function topLevel(selector: string): boolean {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `rule not found: ${selector}`).toBeGreaterThan(-1);
  const before = CSS.slice(0, start);
  const opens = (before.match(/\{/g) ?? []).length;
  const closes = (before.match(/\}/g) ?? []).length;
  return opens === closes;
}

/**
 * The simplest single rule: from `prefix` to its first closing brace. Used where
 * two rules would otherwise share the same selector text (the own-selection
 * geometry rule and each wash's own `background:` rule).
 */
function ruleFrom(prefix: string): string {
  const start = CSS.indexOf(prefix);
  expect(start, `rule not found: ${prefix}`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf("}", start) + 1);
}

const render = (element: ReactElement): string =>
  renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");

const noop = (): void => undefined;

type Rgb = [number, number, number];

const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

const srgbToLinear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = ([red, green, blue]: Rgb): number =>
  0.2126 * srgbToLinear(red) + 0.7152 * srgbToLinear(green) + 0.0722 * srgbToLinear(blue);

/** WCAG 2.x contrast ratio between two opaque colours. */
const contrast = (first: Rgb, second: Rgb): number => {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
};

/** `source` at `alpha` over `base` (both opaque). */
const over = (base: Rgb, source: Rgb, alpha: number): Rgb =>
  base.map((channel, index) => (1 - alpha) * channel + alpha * source[index]) as Rgb;

describe("chapter numeral", () => {
  it("renders the question's number in Persian digits, hidden from assistive tech", () => {
    const question = QUIZ_QUESTIONS[2];
    const html = render(<Question question={question} onSelect={noop} chapterNumeral />);

    expect(html).toContain(
      `<span aria-hidden="true" class="quiz-chapter-numeral">${toPersianDigits(question.order)}</span>`,
    );
    // The small kicker is still there: the watermark repeats it, never replaces it.
    expect(html).toContain(`سؤال ${toPersianDigits(question.order)}`);
  });

  it("is opt-in: the default screen — and so the shared widget's — has none", () => {
    const html = render(<Question question={QUIZ_QUESTIONS[0]} onSelect={noop} />);
    expect(html).not.toContain("quiz-chapter-numeral");

    // The quiz asks for the watermark; the widget keeps its narrower chrome.
    expect(QUIZ_SOURCE).toContain("chapterNumeral");
    expect(WIDGET_SOURCE).not.toContain("chapterNumeral");
  });

  it("sits out of flow behind the words, in the gold the orbs use", () => {
    const numeral = block(".quiz-chapter-numeral");
    expect(numeral).toContain("position: absolute;");
    expect(numeral).toContain("z-index: -1;");
    expect(numeral).toContain("font-family: var(--font-display);");
    expect(numeral).toContain("pointer-events: none;");

    // Same recipe as `.quiz-orb-gold`, so the two golds cannot drift apart.
    expect(numeral).toContain("color: color-mix(in srgb, var(--accent) 58%, white);");
    expect(block(".quiz-orb-gold")).toContain(
      "--orb-color: color-mix(in srgb, var(--accent) 58%, white);",
    );

    // A clamp that stays inside the briefed 8.5–11rem band.
    const size = numeral.match(/font-size: clamp\(([\d.]+)rem, [^,]+, ([\d.]+)rem\);/);
    expect(size, "the numeral needs a rem clamp").not.toBeNull();
    expect(Number(size![1])).toBeGreaterThanOrEqual(8.5);
    expect(Number(size![2])).toBeLessThanOrEqual(11);

    const opacity = Number(numeral.match(/opacity: ([\d.]+);/)![1]);
    expect(opacity).toBeGreaterThanOrEqual(0.12);
    expect(opacity).toBeLessThanOrEqual(0.16);
  });
});

describe("light arc", () => {
  it("opens gold and closes wine: the endpoints", () => {
    expect(arcWashOpacities(0, 10)).toEqual({ gold: ARC_GOLD_START_OPACITY, wine: 0 });
    expect(arcWashOpacities(10, 10)).toEqual({
      gold: ARC_GOLD_FLOOR_OPACITY,
      wine: ARC_WINE_CAP_OPACITY,
    });
    expect(arcWashOpacities(0, 0)).toEqual({ gold: 0, wine: 0 });
  });

  it("moves one way only: gold fades, wine rises, step after step", () => {
    const steps = Array.from({ length: 11 }, (_, answered) => arcWashOpacities(answered, 10));

    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index].gold).toBeLessThan(steps[index - 1].gold);
      expect(steps[index].wine).toBeGreaterThan(steps[index - 1].wine);
    }
    // Mid-quiz both are genuinely in between, never at an endpoint.
    expect(steps[5].gold).toBeGreaterThan(ARC_GOLD_FLOOR_OPACITY);
    expect(steps[5].gold).toBeLessThan(ARC_GOLD_START_OPACITY);
    expect(steps[5].wine).toBeGreaterThan(0);
    expect(steps[5].wine).toBeLessThan(ARC_WINE_CAP_OPACITY);
  });

  it("clamps nonsense instead of extrapolating", () => {
    expect(arcWashOpacities(-5, 10)).toEqual(arcWashOpacities(0, 10));
    expect(arcWashOpacities(99, 10)).toEqual(arcWashOpacities(10, 10));
    expect(arcWashOpacities(3, 0)).toEqual({ gold: 0, wine: 0 });
    expect(arcWashOpacities(Number.NaN, 10)).toEqual({ gold: 0, wine: 0 });
    expect(arcWashOpacities(3, Number.POSITIVE_INFINITY)).toEqual({ gold: 0, wine: 0 });
  });

  it("stays under the briefed wine ceiling, and above the gold floor", () => {
    expect(ARC_WINE_CAP_OPACITY).toBeLessThanOrEqual(0.25);
    expect(ARC_WINE_CAP_OPACITY).toBeGreaterThan(0);
    expect(ARC_GOLD_FLOOR_OPACITY).toBeGreaterThan(0);
    expect(ARC_GOLD_START_OPACITY).toBeGreaterThan(ARC_GOLD_FLOOR_OPACITY);
  });

  it("renders one inert layer holding the two washes at the helper's opacities", () => {
    const html = render(
      <QuizAtmosphere blooms={[]} pulses={[]} answeredCount={5} totalQuestions={10} />,
    );
    const { gold, wine } = arcWashOpacities(5, 10);

    expect(html).toContain('class="quiz-arc pointer-events-none"');
    expect(html).toContain(`class="quiz-arc-gold" style="opacity:${gold}"`);
    expect(html).toContain(`class="quiz-arc-wine" style="opacity:${wine}"`);
    // Bottom-most of the atmosphere layers: the blooms and the fog paint over it.
    expect(html.indexOf("quiz-arc")).toBeLessThan(html.indexOf("quiz-ink"));
  });

  it("is a fixed, inert layer that only ever transitions opacity", () => {
    const arc = block(".quiz-arc");
    expect(arc).toContain("position: fixed;");
    expect(arc).toContain("inset: 0;");
    expect(arc).toContain("z-index: -10;");
    expect(arc).toContain("pointer-events: none;");

    const washes = block(".quiz-arc-gold,\n.quiz-arc-wine");
    expect(washes).toContain("transition: opacity 600ms ease;");
    expect(washes).not.toContain("filter");
    expect(washes).not.toContain("backdrop-filter");

    // Palette-only, and no new hex in either gradient.
    const gold = ruleFrom(".quiz-arc-gold {\n  background: radial-gradient(");
    const wine = ruleFrom(".quiz-arc-wine {\n  background: radial-gradient(");
    expect(gold).toContain("color-mix(in srgb, var(--accent) 58%, white) 0%,");
    expect(wine).toContain("var(--wine) 0%,");
    expect(gold + wine).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("keeps Q10 no darker than the Q1 fog it replaces, so muted labels keep their budget", () => {
    const background = hex("#faf7f2");
    const accent = hex("#b5652d");
    const accentSoft = hex("#f3e5d8");
    const wine = hex("#8a2333");
    const muted = hex("#756b5e");

    // `.quiz-fog`'s strongest colour (80% accent-soft, 20% accent), at the
    // opacity Q1 actually shows.
    const fogged = over(background, over(accentSoft, accent, 0.2), FOG_START_OPACITY);
    const arc = over(background, wine, ARC_WINE_CAP_OPACITY);

    // The arc may not become the new worst phase: by Q10 the fog is gone, so the
    // backdrop only has to match what Q1 already ships.
    expect(contrast(arc, muted)).toBeGreaterThanOrEqual(contrast(fogged, muted));
    expect(contrast(arc, muted)).toBeGreaterThan(4.1);
  });
});

describe("selection moment on the row", () => {
  it("rings the row once, in transform and opacity only", () => {
    const ring = block('.quiz-option-row[aria-pressed="true"]::after');
    expect(ring).toContain('content: "";');
    expect(ring).toContain("position: absolute;");
    expect(ring).toContain("border: 2px solid var(--marker-gold);");
    expect(ring).toContain("border-radius: inherit;");
    expect(ring).toContain("pointer-events: none;");

    // The resting state is INVISIBLE and the animation is the only thing that
    // ever shows it: no loop, and nothing to see in a static run.
    expect(ring).toContain("opacity: 0;");
    expect(ring).not.toContain("animation");

    // The resting rule itself is unconditional — that is what makes the ring
    // invisible no matter the motion preference. Only the animation is gated,
    // asserted in the next case.
    expect(topLevel('.quiz-option-row[aria-pressed="true"]::after')).toBe(true);

    const keyframes = block("@keyframes quiz-option-ring");
    const properties = [...keyframes.matchAll(/([a-zA-Z-]+):\s*[^;]+;/g)].map(([, name]) => name);
    expect(properties.length).toBeGreaterThan(0);
    for (const property of properties) {
      expect(["transform", "opacity"], `unexpected animated property: ${property}`).toContain(
        property,
      );
    }
    expect(keyframes).toContain("transform: scale(1);");
    expect(keyframes).toContain("opacity: 1;");
    expect(keyframes).toContain("transform: scale(1.035);");
    expect(keyframes).toContain("opacity: 0;");
  });

  it("retriggers on every fresh selection and never loops", () => {
    // The one animation declaration sits inside the no-preference gate, on the
    // pressed-state pseudo-element only.
    const animationAt = CSS.indexOf("animation: quiz-option-ring 600ms ease-out;");
    const gateAt = CSS.lastIndexOf("@media (prefers-reduced-motion: no-preference) {", animationAt);
    expect(animationAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(animationAt);
    expect(CSS.slice(gateAt, animationAt)).toContain(
      '.quiz-option-row[aria-pressed="true"]::after {',
    );

    // One iteration, no fill, no `infinite`…
    expect(CSS).not.toContain("quiz-option-ring 600ms ease-out infinite");
    expect((CSS.match(/animation: quiz-option-ring/g) ?? []).length).toBe(1);
    // …declared only while pressed, and the row has no ::after at rest — so
    // releasing and re-pressing recreates the element and replays the ring.
    expect(CSS).not.toContain(".quiz-option-row::after");
    // The row is the ring's positioning context.
    expect(block(".quiz-option-row")).toContain("position: relative;");
  });

  it("keeps the existing pressed styles and paints no marker band", () => {
    const pressed = block('.quiz-option-row[aria-pressed="true"]');
    expect(pressed).toContain("border-color: var(--accent);");
    expect(pressed).toContain("background-color: var(--accent-soft);");
    expect(pressed).toContain("box-shadow: var(--shadow-card);");

    // The rejected band is gone, not merely overridden: no rule that targets the
    // option label — pressed, hovered or at rest — may paint a background, so
    // nothing can paint a highlighter band under the selected text again.
    expect(CSS).not.toContain("var(--marker-gold) 55%");
    const labelRules = [...CSS.matchAll(/[^\n]*quiz-option-label[^{]*\{[^}]*\}/g)].map(
      ([rule]) => rule,
    );
    expect(labelRules.length).toBeGreaterThanOrEqual(3);
    for (const rule of labelRules) {
      expect(rule, `label rule paints a background: ${rule.slice(0, 60)}`).not.toContain(
        "background",
      );
    }
  });

  it("marks the chosen label with a gold ✦ in the gutter it reserves", () => {
    const label = block('.quiz-option-row[aria-pressed="true"] .quiz-option-label');
    const spark = block('.quiz-option-row[aria-pressed="true"] .quiz-option-label::after');

    // Same sparkle as the progress head, at the design's 14px.
    expect(spark).toContain('content: "✦";');
    expect(spark).toContain("color: var(--marker-gold);");
    expect(spark).toContain("font-size: 14px;");

    // Absolutely placed in the reserved inline-end gutter and centred on the
    // label block — that gutter is what makes wrapped labels overlap-proof:
    // every line stops before the padding, so the glyph can never sit on text.
    expect(spark).toContain("position: absolute;");
    expect(spark).toContain("inset-inline-end: 0;");
    expect(spark).toContain("top: 50%;");
    expect(spark).toContain("transform: translateY(-50%);");
    expect(label).toContain("padding-inline-end: 1.4rem;");
    expect(label).toContain("position: relative;");

    // Decorative and inert: it is a pseudo-element, so it cannot take a click,
    // and it is explicitly pointer-inert as well.
    expect(spark).toContain("pointer-events: none;");

    // Visible with no motion at all: the resting rule is unconditional.
    expect(topLevel('.quiz-option-row[aria-pressed="true"] .quiz-option-label::after')).toBe(true);

    // Gated on the pressed state: every rule that could paint a sparkle names it.
    for (const match of CSS.matchAll(/[^\n]*quiz-option-label::after[^\n]*/g)) {
      expect(match[0], `ungated sparkle selector: ${match[0]}`).toContain('[aria-pressed="true"]');
    }

    // An unpressed row reserves nothing and shows nothing: the base label rule
    // is matched standalone — `block()` would find the pressed rule first, since
    // that selector ends with this same text.
    const baseLabel = CSS.match(/\n\.quiz-option-label \{[^}]*\}/)?.[0] ?? "";
    expect(baseLabel).not.toBe("");
    expect(baseLabel).not.toContain("padding");
    expect(baseLabel).not.toContain("::after");
  });

  it("fades the ✦ in once, then rests — static under reduced motion", () => {
    const animationAt = CSS.indexOf("animation: quiz-option-spark");
    expect(animationAt).toBeGreaterThan(-1);
    const gateAt = CSS.lastIndexOf("@media (prefers-reduced-motion: no-preference) {", animationAt);
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(animationAt);
    expect(CSS.slice(gateAt, animationAt)).toContain(
      '.quiz-option-row[aria-pressed="true"] .quiz-option-label::after {',
    );

    // 240ms, one iteration, declared exactly once: it plays on selection and
    // never loops.
    expect(CSS).toContain("animation: quiz-option-spark 240ms ease-out;");
    expect(CSS).not.toContain("quiz-option-spark 240ms ease-out infinite");
    expect((CSS.match(/animation: quiz-option-spark/g) ?? []).length).toBe(1);

    const keyframes = block("@keyframes quiz-option-spark");
    const properties = [...keyframes.matchAll(/([a-zA-Z-]+):\s*[^;]+;/g)].map(([, name]) => name);
    expect(properties.length).toBeGreaterThan(0);
    for (const property of properties) {
      expect(["transform", "opacity"], `unexpected animated property: ${property}`).toContain(
        property,
      );
    }
    // The settle keeps the centring translate; dropping it would jump the glyph.
    expect(keyframes).toContain("translateY(-50%) scale(0.6);");
    expect(keyframes).toContain("translateY(-50%) scale(1);");
  });
});

describe("progress marker", () => {
  it("rides the head of the fill and never enters the clipped track", () => {
    const html = render(<ProgressBar current={3} total={10} />);

    // The progressbar contract and the copy are untouched.
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="30"');
    expect(html).toContain("سؤال ۳ از ۱۰");
    expect(html).toContain("۳۰٪");

    // 30% in from the inline start (RTL: the right edge), decorative.
    expect(html).toContain(
      '<span aria-hidden="true" class="quiz-progress-spark" style="inset-inline-start:30%">✦</span>',
    );

    // A sibling of the track, not a child: both of the track's own closing tags
    // come before the marker, so the track's overflow-hidden cannot clip it.
    const track = html.indexOf("overflow-hidden");
    const spark = html.indexOf("quiz-progress-spark");
    expect(track).toBeGreaterThan(-1);
    expect(spark).toBeGreaterThan(track);
    expect((html.slice(track, spark).match(/<\/div>/g) ?? []).length).toBe(2);
  });

  it("is wine-coloured, 14px, and follows the fill's own 500ms move", () => {
    const spark = block(".quiz-progress-spark");
    expect(spark).toContain("color: var(--wine);");
    expect(spark).toContain("font-size: 14px;");
    expect(spark).toContain("transition: inset-inline-start 500ms ease-out;");
    expect(spark).toContain("pointer-events: none;");
    expect(topLevel(".quiz-progress-spark")).toBe(true);
  });
});
