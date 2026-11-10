import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RecommendationCard from "@/components/results/RecommendationCard";
import { makeMatchResult } from "@/tests/ai/fixtures";
import type { MatchedPerfume } from "@/types/recommendation";

/**
 * Batch 34 — the gold closeness bar on /result recommendation cards.
 *
 * The honesty rule from batch 23 is the load-bearing one: the bar's length is
 * the SAME rounded whole number the card prints, never the raw engine value and
 * never a rescaled length. The rest is that the bar is decorative, that it grows
 * exactly once, and that the printed line and the rest of the card stay as they
 * were.
 */

const CARD_SOURCE = readFileSync(
  new URL("../../components/results/RecommendationCard.tsx", import.meta.url),
  "utf8",
);
const WIDGET_SOURCE = readFileSync(
  new URL("../../components/widget/WidgetRecommendationCard.tsx", import.meta.url),
  "utf8",
);
const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

const render = (element: ReactElement): string =>
  renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");

/** A recommendation carrying `presentationScore`, everything else untouched. */
function withScore(presentationScore: number): MatchedPerfume {
  const base = makeMatchResult().recommendations[0];
  return { ...base, presentationScore };
}

const htmlFor = (score: number): string =>
  render(<RecommendationCard recommendation={withScore(score)} />);

/** The number the card prints, read back as an integer. */
function printedIndex(html: string): number {
  const match = html.match(/شاخص نزدیکی ([۰-۹]+)/);
  expect(match, "the closeness line is missing").not.toBeNull();
  return Number([...match![1]].map((digit) => PERSIAN.indexOf(digit)).join(""));
}

/** The fill's inline width, in percent. */
function fillWidth(html: string): number {
  const match = html.match(/style="width:([0-9.]+)%/);
  expect(match, "the fill has no inline width").not.toBeNull();
  return Number(match![1]);
}

describe("results closeness bar", () => {
  it("prints exactly the rounded index, as before", () => {
    // Byte-identical printed line: same class list, same Persian digits.
    expect(htmlFor(92.4)).toContain(
      '<span class="tnum shrink-0 text-sm font-semibold text-accent">' +
        "شاخص نزدیکی ۹۲</span>",
    );
    expect(printedIndex(htmlFor(92.4))).toBe(92);
    expect(printedIndex(htmlFor(89.6))).toBe(90);
    expect(printedIndex(htmlFor(92.5))).toBe(93);
    expect(printedIndex(htmlFor(100))).toBe(100);
    expect(printedIndex(htmlFor(0))).toBe(0);
  });

  it("fills to exactly the number it prints — never the raw engine value", () => {
    // The two directions of the equality, on the representative scores.
    for (const [score, expected] of [
      [92.4, 92],
      [89.6, 90],
      [92.5, 93],
      [78.2, 78],
      [100, 100],
      [0, 0],
    ] as const) {
      const html = htmlFor(score);
      expect(fillWidth(html)).toBe(expected);
      expect(printedIndex(html)).toBe(expected);
      // The raw fractional value never leaks into the length (a whole-number
      // score and its rounded form are the same string, so those are skipped).
      if (score !== expected) expect(html).not.toContain(`width:${score}%`);
    }

    // No fractional lengths at all: the bar is a whole number of percent.
    expect(htmlFor(92.4)).not.toMatch(/width:[0-9]+\.[0-9]+%/);
  });

  it("derives the length from one shared rounding, not a second formula", () => {
    // One `Math.round` feeds both the digits and the width…
    expect(CARD_SOURCE).toContain("const closeness = Math.round(presentationScore);");
    expect(CARD_SOURCE).toContain("formatPersianScore(closeness)");
    expect(CARD_SOURCE).toContain("width: `${closeness}%`");
    // …so the raw score can no longer reach the width.
    expect(CARD_SOURCE).not.toContain("width: `${presentationScore}%`");
  });

  it("keeps the slim track decorative and the accessible value on the bar", () => {
    const html = htmlFor(92.4);

    // The painted track is 5px, rounded, and hidden from the a11y tree.
    const trackAt = html.indexOf("h-[5px]");
    expect(trackAt, "no 5px track").toBeGreaterThan(-1);
    const trackTag = html.slice(
      html.lastIndexOf("<div", trackAt),
      html.indexOf(">", trackAt) + 1,
    );
    expect(trackTag).toContain('aria-hidden="true"');
    expect(trackTag).toContain("rounded-full");
    expect(trackTag).toContain("bg-surface-2");
    expect(trackTag).toContain("overflow-hidden");

    // The progressbar contract that already shipped stays, with the same name
    // and the same whole-number value.
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="92"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-label="شاخص نزدیکی ');
  });

  it("paints gold into the card's accent family", () => {
    const html = htmlFor(92.4);

    expect(html).toContain("linear-gradient(to left, var(--marker-gold) 0%");
    expect(html).toContain("color-mix(in srgb, var(--marker-gold) 55%, var(--accent)) 60%");
    expect(html).toContain("var(--accent) 100%");
    // Gold comes from the one palette token — no hex restated in the card.
    expect(CARD_SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("grows once and stops: no loop, no shimmer, no second pass", () => {
    const at = CSS.indexOf(".rec-score-fill {");
    expect(at, "no .rec-score-fill rule").toBeGreaterThan(-1);
    const rule = CSS.slice(at, CSS.indexOf("}", at));

    // One animation, one pass, ending at the inline target width.
    expect(rule).toContain("animation: rec-score-grow 520ms");
    expect(rule).toContain(" both;");
    expect(rule).not.toContain("infinite");
    expect(rule).not.toContain("alternate");

    // The keyframe only starts from empty; the target is the declared width.
    const keyframeAt = CSS.indexOf("@keyframes rec-score-grow {");
    expect(keyframeAt).toBeGreaterThan(-1);
    const keyframe = CSS.slice(keyframeAt, CSS.indexOf("\n}\n", keyframeAt));
    expect(keyframe).toContain("from {\n    width: 0;\n  }");
    expect(keyframe).not.toContain("infinite");

    // Nothing shimmers or iterates anywhere near this bar.
    expect(CARD_SOURCE).not.toMatch(/shimmer|infinite|animation/);
    expect(rule).not.toContain("shimmer");
  });

  it("sits still at full width when the preference asks for less motion", () => {
    const reducedAt = CSS.indexOf(
      "@media (prefers-reduced-motion: reduce) {\n  .rec-score-fill {",
    );
    expect(reducedAt, "no reduced-motion gate on the closeness bar").toBeGreaterThan(-1);
    expect(CSS.slice(reducedAt)).toContain("animation: none;");

    // SSR already renders the finished length, so no-JS shows the full bar.
    expect(fillWidth(htmlFor(92.4))).toBe(92);
  });

  it("leaves the rest of the card, and the widget's cards, untouched", () => {
    const html = htmlFor(92.4);
    const recommendation = withScore(92.4);

    expect(html).toContain(recommendation.name);
    expect(html).toContain('role="img"');
    expect(html).toContain("rank-chip");
    if (recommendation.productUrl) expect(html).toContain("مشاهده در ترب");
    // The card's own entrance is still the untouched staged reveal.
    expect(html).toContain("quiz-rise");
    // No second bar was added anywhere on the card.
    expect(html.match(/role="progressbar"/g) ?? []).toHaveLength(1);
    expect(html.match(/rec-score-fill/g) ?? []).toHaveLength(1);

    // WidgetApp renders its own cards; this batch does not reach them.
    expect(WIDGET_SOURCE).not.toContain("rec-score-fill");
    expect(WIDGET_SOURCE).not.toContain("marker-gold");
  });
});
