import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import QuizSpray, { MAX_MOTES, MAX_PLUMES, MOTE_MAX_SIZE_PX, MOTE_MIN_SIZE_PX } from "@/components/quiz/QuizSpray";
import QuizPage from "@/app/quiz/page";

/**
 * Quiz ambience, act 3 — the spray.
 *
 * Four halves, because this act has to hold four different promises:
 *  - the node caps (3 plumes, 48 motes) are structural, not aspirational;
 *  - both layers are decorative and inert (aria-hidden, pointer-events: none);
 *  - the paint order is the specification (behind the cards, above the fog);
 *  - the motion is ambient and compositor-only, and reduced-motion is honoured.
 *
 * Everything is derived from the real markup and the real CSS — no snapshots of
 * the visuals, so a future edit that breaks a constraint fails loudly.
 */

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** Act 3's whole CSS section: from its first rule to the end of the file. */
const ACT3 = CSS.slice(CSS.indexOf(".quiz-plume-layer {"));

function block(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  expect(start, `rule not found: ${selector}`).toBeGreaterThan(-1);

  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated rule: ${selector}`);
}

const renderSpray = () => renderToStaticMarkup(<QuizSpray />).replace(/<!--[\s\S]*?-->/g, "");

const numbers = (source: string, pattern: RegExp): number[] =>
  [...source.matchAll(pattern)].map(([, value]) => Number(value));

const starts = (source: string): string[] =>
  [...source.matchAll(/left:\s*(\d+)%;\s*top:\s*(\d+)%/g)].map(([, left, top]) => `${left},${top}`);

const SIZES = /width:\s*(\d+)px/g;
const DURATIONS = /animation-duration:\s*(\d+)s/g;
const DELAYS = /animation-delay:\s*(-?\d+)s/g;

describe("node caps", () => {
  const html = renderSpray();
  const plumeLayer = html.slice(html.indexOf("quiz-plume-layer"), html.indexOf("quiz-mote-layer"));
  const moteLayer = html.slice(html.indexOf("quiz-mote-layer"));

  it("holds the plumes at three", () => {
    expect(MAX_PLUMES).toBe(3);
    expect((plumeLayer.match(/class="quiz-plume"/g) ?? []).length).toBe(MAX_PLUMES);
    expect((plumeLayer.match(/class="quiz-plume"/g) ?? []).length).toBeLessThanOrEqual(MAX_PLUMES);
  });

  it("holds the mote field at 48 specks, each 2–5px", () => {
    expect(MAX_MOTES).toBe(48);
    expect((moteLayer.match(/class="quiz-mote"/g) ?? []).length).toBe(MAX_MOTES);

    const sizes = numbers(moteLayer, SIZES);
    expect(sizes).toHaveLength(MAX_MOTES);
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(MOTE_MIN_SIZE_PX);
      expect(size).toBeLessThanOrEqual(MOTE_MAX_SIZE_PX);
    }
  });

  it("spreads both layers: no two nodes share a spot or a phase", () => {
    const plumeStarts = starts(plumeLayer);
    const plumeDelays = numbers(plumeLayer, DELAYS);
    const moteStarts = starts(moteLayer);
    const moteDelays = numbers(moteLayer, DELAYS);
    const moteDurations = numbers(moteLayer, DURATIONS);

    expect(new Set(plumeStarts).size).toBe(MAX_PLUMES);
    expect(new Set(moteStarts).size).toBe(MAX_MOTES);
    expect(new Set(plumeDelays).size).toBe(MAX_PLUMES);
    // Staggered (phases differ) and long enough that the shimmer never lands in
    // lockstep — which is how "randomized" is achieved without any JavaScript.
    expect(new Set(moteDelays).size).toBeGreaterThan(MAX_MOTES / 2);
    expect(new Set(moteDurations).size).toBeGreaterThan(4);
  });
});

describe("decorative and inert", () => {
  const html = renderSpray();

  it("marks both layers aria-hidden and pointer-events: none", () => {
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBe(2);
    expect((html.match(/pointer-events-none/g) ?? []).length).toBe(2);
  });

  it("carries no copy, no Persian text and no emoji", () => {
    expect(html).not.toMatch(/[\u0600-\u06FF]/u);
    expect(html).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it("is ambient, not answer-driven: present and identical with zero answers", async () => {
    // The quiz opens with no answers, no blooms, no fog change — yet the spray
    // is already there, because nothing about it reads the flow.
    const intro = renderToStaticMarkup(await QuizPage({ searchParams: Promise.resolve({}) }));

    expect(intro).toContain("quiz-plume-layer");
    expect(intro).toContain("quiz-mote-layer");
    // …while the answer-driven layer is legitimately empty at this point.
    expect((intro.match(/class="quiz-bloom quiz-bloom-tint-\d"/g) ?? []).length).toBe(0);
  });
});

describe("layer order", () => {
  it("paints behind the cards and above the fog, in DOM order", async () => {
    const html = renderToStaticMarkup(await QuizPage({ searchParams: Promise.resolve({}) }));

    const markers = [
      "quiz-ambience", // washes
      "quiz-ink", // ink blooms
      "quiz-fog", // clearing fog
      "quiz-plume-layer", // mist plumes
      "quiz-mote-layer", // golden motes
      "quiz-rise", // the first quiz card
    ].map((marker) => html.indexOf(marker));

    for (const [index, position] of markers.entries()) {
      expect(position, `missing marker ${index}`).toBeGreaterThan(-1);
      if (index > 0) expect(position).toBeGreaterThan(markers[index - 1]);
    }
  });

  it("keeps both layers on the negative z-plane, under the grain and the pulse", () => {
    for (const selector of [".quiz-plume-layer", ".quiz-mote-layer"]) {
      expect(block(ACT3, selector)).toContain("z-index: -10;");
      expect(block(ACT3, selector)).toContain("position: fixed;");
      expect(block(ACT3, selector)).toContain("pointer-events: none;");
    }

    const grainZ = Number(block(CSS, ".quiz-grain").match(/z-index: (\d+);/)![1]);
    const pulseZ = Number(block(CSS, ".quiz-pulse-layer").match(/z-index: (\d+);/)![1]);
    expect(grainZ).toBeGreaterThan(0);
    expect(pulseZ).toBeGreaterThan(grainZ);
  });
});

describe("the plume puff", () => {
  const rule = block(ACT3, ".quiz-plume");
  const keyframes = block(ACT3, "@keyframes quiz-plume-puff");
  const html = renderSpray();
  const durations = numbers(
    html.slice(html.indexOf("quiz-plume-layer"), html.indexOf("quiz-mote-layer")),
    DURATIONS,
  );

  it("puffs on its own cycle: ~4.5s of mist, then silence until the next one", () => {
    expect(rule).toContain("animation-name: quiz-plume-puff;");
    expect(rule).toContain("animation-iteration-count: infinite;");
    expect(durations).toHaveLength(MAX_PLUMES);

    // The puff is the first 38% of each node's shared 12s cycle (the stop where
    // the mist has fully dissipated), which is the ~4.5s of visible mist.
    expect(keyframes).toContain("38% {");
    const puffShare = 0.38;
    for (const duration of durations) {
      expect(duration).toBeGreaterThanOrEqual(12);
      const puffSeconds = duration * puffShare;
      expect(puffSeconds).toBeGreaterThanOrEqual(3.5);
      expect(puffSeconds).toBeLessThanOrEqual(7);
    }

    // …and the mist is gone at the end of the puff AND at the end of the cycle,
    // so the node waits invisibly instead of lingering as a permanent haze.
    const stops = keyframes.split(/\n {2}\d+% \{/).slice(1);
    expect(stops).toHaveLength(4);
    expect(stops[0]).toContain("opacity: 0;");
    expect(stops[1]).toContain("opacity: var(--plume-peak);");
    expect(stops[2]).toContain("opacity: 0;");
    expect(stops[3]).toContain("opacity: 0;");
  });

  it("starts a fresh puff every ~3.5–4s: one shared cycle, evenly phased", () => {
    const delays = numbers(
      html.slice(html.indexOf("quiz-plume-layer"), html.indexOf("quiz-mote-layer")),
      DELAYS,
    );

    // A single shared cycle length is what keeps the three starts evenly spaced;
    // unequal periods drift out of phase and open real lulls (measured).
    const cycle = durations[0];
    expect(new Set(durations).size).toBe(1);

    const onsets = delays
      .map((delay) => (((-delay) % cycle) + cycle) % cycle)
      .sort((a, b) => a - b);
    const gaps = onsets.map((onset, index) =>
      index === 0 ? onsets[0] + cycle - onsets.at(-1)! : onset - onsets[index - 1],
    );

    for (const gap of gaps) {
      expect(gap, `gap of ${gap}s is outside the brief's ~3.5–4s`).toBeGreaterThanOrEqual(3.5);
      expect(gap).toBeLessThanOrEqual(4);
    }
  });

  it("expands, drifts, and stays a whisper", () => {
    expect(keyframes).toContain("scale(0.32)");
    expect(keyframes).toContain("scale(1.5)");
    expect(keyframes).toContain("var(--plume-dx, 0px)");
    expect(keyframes).toContain("var(--plume-dy, 0px)");

    // The peak is a measured value, and the band is deliberately narrow. At
    // 0.3 with a whiter mix the whole puff moved real pixels by at most 2–3
    // levels — invisible on a cream page. The committed recipe puts ~2600 px
    // of a puff at ≥4 levels with a 9–14 level core, which is still under the
    // full strength of act 2's fog. Anything past 0.45 stops being a whisper.
    const peak = Number(rule.match(/--plume-peak: ([\d.]+);/)![1]);
    expect(peak).toBeGreaterThanOrEqual(0.3);
    expect(peak).toBeLessThanOrEqual(0.45);
    // Warm white with a whisper of amber: palette token + white, no new hex.
    expect(rule).toMatch(/color-mix\(in srgb, var\(--accent\) \d+%, white\)/);
  });
});

describe("the golden motes", () => {
  const keyframes = block(ACT3, "@keyframes quiz-mote-drift");
  const moves = [...keyframes.matchAll(/translate3d\((-?\d+)px, (-?\d+)px, 0\)/g)].map(([, x, y]) => ({
    x: Number(x),
    y: Number(y),
  }));

  it("drifts upward, monotonically, with a sway", () => {
    expect(moves.length).toBeGreaterThanOrEqual(4);
    for (let index = 1; index < moves.length; index += 1) {
      expect(moves[index].y).toBeLessThanOrEqual(moves[index - 1].y);
    }
    expect(moves.at(-1)!.y).toBeLessThan(0); // …it actually rises
    expect(moves.some((move) => move.x > 0)).toBe(true);
    expect(moves.some((move) => move.x < 0)).toBe(true);
  });

  it("twinkles: several distinct opacity levels across the loop", () => {
    const opacities = new Set([...keyframes.matchAll(/opacity: ([^;]+);/g)].map(([, value]) => value));

    expect(opacities.size).toBeGreaterThanOrEqual(4);
    expect([...opacities].some((value) => value.includes("--mote-opacity") && value.includes("*"))).toBe(true);
    expect(keyframes).toContain("opacity: 0;");
  });

  it("is a warm gold from the existing palette", () => {
    expect(block(ACT3, ".quiz-mote")).toMatch(/color-mix\(in srgb, var\(--accent\) \d+%, white\)/);
  });
});

describe("composition — the origins sit in air the card leaves free", () => {
  // The quiz card is opaque and covers the centre of the screen, so an effect
  // whose core is behind it does not render at all. These assertions lock the
  // placement that was measured in a browser: plumes' cores in the band under
  // the header (the only air a phone has) or in a side margin, dust in the
  // edges, the side bands and the middle strip-crossers — and never the footer.
  const html = renderSpray();
  const plumeLayer = html.slice(html.indexOf("quiz-plume-layer"), html.indexOf("quiz-mote-layer"));
  const moteLayer = html.slice(html.indexOf("quiz-mote-layer"));
  const plumes = starts(plumeLayer).map((pair) => pair.split(",").map(Number));
  const motes = starts(moteLayer).map((pair) => pair.split(",").map(Number));

  it("keeps two plumes in the band under the header, where every viewport has air", () => {
    expect(plumes.filter(([, top]) => top <= 12)).toHaveLength(2);
  });

  it("puts the third plume in a side margin rather than behind the card", () => {
    for (const [left, top] of plumes) {
      expect(top <= 12 || left <= 27 || left >= 74, `plume ${left},${top} starts behind the card`).toBe(true);
    }
  });

  it("keeps twelve or more motes in the edge columns a phone still shows", () => {
    expect(motes.filter(([left]) => left <= 3 || left >= 97).length).toBeGreaterThanOrEqual(12);
  });

  it("starts every middle-column mote high enough to rise through that band", () => {
    const middle = motes.filter(([left]) => left >= 34 && left <= 66);

    expect(middle.length).toBeGreaterThanOrEqual(16);
    for (const [left, top] of middle) {
      // The climb is 134px, so a start at 26% or below reaches the free band
      // (which ends around 12% of the viewport) while the mote is still lit.
      expect(top, `mote ${left},${top} never reaches the free band`).toBeLessThanOrEqual(26);
    }
  });

  it("keeps every mote above the footer band", () => {
    for (const [left, top] of motes) {
      expect(top, `mote ${left},${top} starts in the footer band`).toBeLessThanOrEqual(74);
    }
  });
});

describe("act 3 CSS contract", () => {
  it("animates transform and opacity only — no filters, no shadows", () => {
    for (const selector of ["@keyframes quiz-plume-puff", "@keyframes quiz-mote-drift"]) {
      const properties = [...block(ACT3, selector).matchAll(/([a-zA-Z-]+):\s*[^;]+;/g)].map(([, name]) => name);

      expect(properties.length).toBeGreaterThan(0);
      for (const property of properties) {
        expect(["transform", "opacity"], `unexpected animated property ${property}`).toContain(property);
      }
    }

    for (const selector of [".quiz-plume-layer", ".quiz-plume", ".quiz-mote-layer", ".quiz-mote"]) {
      const rule = block(ACT3, selector);
      expect(rule).not.toContain("filter:");
      expect(rule).not.toContain("backdrop-filter");
      expect(rule).not.toContain("box-shadow");
    }

    expect(ACT3).not.toContain("filter:");
    expect(ACT3).not.toContain("blur(");
    expect(ACT3).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("goes quiet under prefers-reduced-motion: plumes faint and static, motes gone", () => {
    const reduced = ACT3.slice(ACT3.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    const plume = block(reduced, ".quiz-plume");

    expect(plume).toContain("animation: none;");
    expect(plume).toMatch(/opacity: calc\(var\(--plume-peak\) \* [\d.]+\);/); // still faintly there
    expect(plume).toContain("transform: translate(-50%, -50%) scale(1.05);");
    expect(block(reduced, ".quiz-mote-layer")).toContain("display: none;");
  });
});
