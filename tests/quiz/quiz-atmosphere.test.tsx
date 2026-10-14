import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Quiz from "@/components/quiz/Quiz";
import QuizAtmosphere, {
  ANSWER_PULSE_MS,
  FOG_START_OPACITY,
  MAX_INK_BLOOMS,
  MAX_LIVE_PULSES,
  QUIZ_BLOOM_TINTS,
  bloomTintFor,
  fogOpacityFor,
  withInkBloom,
  type InkBloom,
} from "@/components/quiz/QuizAtmosphere";

/**
 * Quiz ambience, act 2 — the contract.
 *
 * Three halves, because the effects live in three places:
 *  - the pure helpers the flow actually drives (bloom cap, fog curve, tints),
 *  - the rendered markup every layer must emit (aria-hidden, inert, one node per
 *    bloom, fog opacity as a function of the answered count),
 *  - the CSS that makes them what they are (compositor-only properties, no
 *    filters, the layering order, the reduced-motion bypasses).
 *
 * Nothing is a snapshot of the visuals: every assertion is one of the brief's
 * constraints, so breaking one fails loudly.
 */

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** The whole act-2 section: from the first ink rule to the end of the file. */
const ACT2 = CSS.slice(CSS.indexOf(".quiz-ink {"));

/** The full text of one `selector { … }` rule (brace-matched, no nesting). */
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

const bloom = (index: number): InkBloom => ({
  questionId: `q-${index}`,
  x: 100 + index,
  y: 200 + index,
  tint: bloomTintFor(index),
});

describe("ink bloom bookkeeping", () => {
  it("costs one node per answered question, and answering again moves it", () => {
    let blooms: InkBloom[] = [];
    for (let index = 0; index < 4; index += 1) {
      blooms = withInkBloom(blooms, bloom(index));
    }
    expect(blooms).toHaveLength(4);

    // Same question, different option: replace, never add.
    blooms = withInkBloom(blooms, { questionId: "q-1", x: 5, y: 6, tint: 2 });
    expect(blooms).toHaveLength(4);
    expect(blooms.filter((item) => item.questionId === "q-1")).toHaveLength(1);
    expect(blooms.at(-1)).toEqual({ questionId: "q-1", x: 5, y: 6, tint: 2 });
  });

  it("hard-caps the live nodes at ten, dropping the oldest", () => {
    let blooms: InkBloom[] = [];
    for (let index = 0; index < MAX_INK_BLOOMS + 5; index += 1) {
      blooms = withInkBloom(blooms, bloom(index));
    }

    expect(blooms).toHaveLength(MAX_INK_BLOOMS);
    // The five oldest are gone, the newest five survived.
    expect(blooms.map((item) => item.questionId)).toEqual([
      "q-5",
      "q-6",
      "q-7",
      "q-8",
      "q-9",
      "q-10",
      "q-11",
      "q-12",
      "q-13",
      "q-14",
    ]);
  });

  it("cycles a bounded set of palette tints", () => {
    for (let index = 0; index < 12; index += 1) {
      const tint = bloomTintFor(index);
      expect(tint).toBeGreaterThanOrEqual(0);
      expect(tint).toBeLessThan(QUIZ_BLOOM_TINTS);
      expect(tint).toBe(index % QUIZ_BLOOM_TINTS);
    }
    expect([0, 1, 2, 3, 4, 5].map(bloomTintFor)).toEqual([0, 1, 2, 0, 1, 2]);
    // Nothing negative or fractional can escape into a class name.
    expect(bloomTintFor(-1)).toBe(1);
    expect(bloomTintFor(Number.NaN)).toBe(0);
  });
});

describe("clearing fog curve", () => {
  it("starts at 0.45 and reaches exactly 0 after the last question", () => {
    expect(fogOpacityFor(0, 10)).toBe(FOG_START_OPACITY);
    expect(fogOpacityFor(10, 10)).toBe(0);
    expect(FOG_START_OPACITY).toBeCloseTo(0.45, 2);
  });

  it("thins with every answered question, strictly and monotonically", () => {
    const steps = Array.from({ length: 11 }, (_, answered) => fogOpacityFor(answered, 10));

    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index]).toBeLessThan(steps[index - 1]);
    }
    expect(steps.at(-1)).toBe(0);
  });

  it("clamps nonsense input instead of extrapolating", () => {
    expect(fogOpacityFor(-5, 10)).toBe(FOG_START_OPACITY);
    expect(fogOpacityFor(99, 10)).toBe(0);
    expect(fogOpacityFor(3, 0)).toBe(0);
    expect(fogOpacityFor(Number.NaN, 10)).toBe(0);
  });
});

describe("rendered layers", () => {
  const render = (props: Parameters<typeof QuizAtmosphere>[0]) =>
    renderToStaticMarkup(<QuizAtmosphere {...props} />);

  it("is decorative and inert: aria-hidden and pointer-events-none on all three", () => {
    const html = render({ blooms: [bloom(0)], pulses: [{ id: 1, x: 10, y: 20 }], answeredCount: 0, totalQuestions: 10 });

    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBe(3);
    expect((html.match(/pointer-events-none/g) ?? []).length).toBe(3);
  });

  it("renders exactly one bloom node per answer, with its tint class", () => {
    const blooms = [bloom(0), bloom(1), bloom(2)];
    const html = render({ blooms, pulses: [], answeredCount: 3, totalQuestions: 10 });

    expect((html.match(/class="quiz-bloom quiz-bloom-tint-\d"/g) ?? []).length).toBe(3);
    expect(html).toContain("quiz-bloom-tint-0");
    expect(html).toContain("quiz-bloom-tint-1");
    expect(html).toContain("quiz-bloom-tint-2");
  });

  it("drives the fog's opacity from the answered count, in the markup", () => {
    const opacityAt = (answeredCount: number) => {
      const html = render({ blooms: [], pulses: [], answeredCount, totalQuestions: 10 });
      const match = html.match(/class="quiz-fog pointer-events-none" style="opacity:([0-9.]+)"/);
      expect(match, `no fog opacity at ${answeredCount}`).not.toBeNull();
      return Number(match![1]);
    };

    expect(opacityAt(0)).toBe(0.45);
    expect(opacityAt(5)).toBe(0.225);
    expect(opacityAt(10)).toBe(0);
  });

  it("renders a ripple per live pulse and nothing else — no copy, no emoji", () => {
    const html = render({
      blooms: [],
      pulses: [
        { id: 1, x: 10, y: 20 },
        { id: 2, x: 30, y: 40 },
      ],
      answeredCount: 1,
      totalQuestions: 10,
    });

    expect((html.match(/class="quiz-pulse"/g) ?? []).length).toBe(2);
    expect(html).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    // Decoration only: the layers carry no text at all.
    expect(html).not.toMatch(/>[^<]*[\u0600-\u06FF][^<]*</u);
  });

  it("is mounted for the whole quiz, intro included", () => {
    const html = renderToStaticMarkup(<Quiz />);

    expect(html).toContain("quiz-ink");
    expect(html).toContain("quiz-fog");
    expect(html).toContain("quiz-pulse-layer");
    // …and the intro copy is untouched.
    expect(html).toContain("عطر مناسب خودت رو پیدا کن");
    expect(html).toContain("شروع آزمون");
  });
});

describe("act 2 CSS contract", () => {
  it("keeps the layering order: washes → ink → fog → cards → grain → pulse", () => {
    // Blooms and fog are behind the cards (negative z), the pulse is above the
    // grain (positive z, larger than the grain's 50), so the ripple travels over
    // everything as the brief requires.
    expect(block(ACT2, ".quiz-ink")).toContain("z-index: -10;");
    expect(block(ACT2, ".quiz-fog")).toContain("z-index: -10;");
    expect(block(ACT2, ".quiz-ink")).toContain("position: fixed;");
    expect(block(ACT2, ".quiz-fog")).toContain("position: fixed;");

    const pulseZ = Number(block(ACT2, ".quiz-pulse-layer").match(/z-index: (\d+);/)![1]);
    const grainZ = Number(block(CSS, ".quiz-grain").match(/z-index: (\d+);/)![1]);
    expect(pulseZ).toBeGreaterThan(grainZ);
  });

  it("diffuses the ink over 2s and settles there: the base state IS the rest state", () => {
    const rule = block(ACT2, ".quiz-bloom");
    expect(rule).toContain("animation: quiz-bloom-diffuse 2000ms");

    const keyframes = block(ACT2, "@keyframes quiz-bloom-diffuse");
    expect(keyframes).toContain("opacity: var(--bloom-rest);");
    expect(keyframes).toContain(
      "transform: translate(-50%, -50%) scale(var(--bloom-rest-scale));",
    );
    // Filled forwards so the bloom stays put after it finishes.
    expect(rule).toContain("forwards");
    // …and the resting rule already matches that end state, which is what makes
    // the reduced-motion path a single `animation: none`.
    expect(rule).toContain("opacity: var(--bloom-rest);");
    expect(rule).toContain("transform: translate(-50%, -50%) scale(var(--bloom-rest-scale));");
    expect(keyframes).toContain("opacity: var(--bloom-peak);");
  });

  it("animates transform and opacity only — no filters, no layout", () => {
    // What actually moves: the keyframes may not touch anything else, so no
    // property here can trigger layout or paint per frame.
    for (const selector of ["@keyframes quiz-bloom-diffuse", "@keyframes quiz-pulse-ripple"]) {
      const properties = [...block(ACT2, selector).matchAll(/([a-zA-Z-]+):\s*[^;]+;/g)].map(
        ([, name]) => name,
      );

      expect(properties.length).toBeGreaterThan(0);
      for (const property of properties) {
        expect(
          ["transform", "opacity"],
          `unexpected animated property in ${selector}: ${property}`,
        ).toContain(property);
      }
    }

    // Geometry is declared once, outside the animation, and none of the animated
    // layers carries a filter (re-rasterised per frame) or a shadow (repainted).
    for (const selector of [
      ".quiz-ink",
      ".quiz-bloom",
      ".quiz-fog",
      ".quiz-pulse-layer",
      ".quiz-pulse",
    ]) {
      const rule = block(ACT2, selector);
      expect(rule).not.toContain("filter:");
      expect(rule).not.toContain("backdrop-filter");
      expect(rule).not.toContain("box-shadow");
    }

    // No filters anywhere in act 2 (the film grain is the only filtered layer in
    // the file, and it is static).
    expect(ACT2).not.toContain("filter:");
    expect(ACT2).not.toContain("blur(");
  });

  it("stays restrained: low resting ink, a light fog, a brief ripple", () => {
    const rest = Number(block(ACT2, ".quiz-bloom").match(/--bloom-rest: ([0-9.]+);/)![1]);
    const peak = Number(block(ACT2, ".quiz-bloom").match(/--bloom-peak: ([0-9.]+);/)![1]);

    expect(rest).toBeGreaterThan(0);
    expect(rest).toBeLessThanOrEqual(0.08);
    expect(peak).toBeGreaterThan(rest);
    expect(peak).toBeLessThanOrEqual(0.25);

    expect(block(ACT2, ".quiz-bloom").match(/quiz-bloom-diffuse 2000ms/)).not.toBeNull();
    expect(block(ACT2, ".quiz-pulse")).toContain(`quiz-pulse-ripple ${ANSWER_PULSE_MS}ms`);
    expect(ANSWER_PULSE_MS).toBe(600);
    expect(MAX_LIVE_PULSES).toBeLessThanOrEqual(4);
  });

  it("thins the fog on opacity only, over one second", () => {
    const fog = block(ACT2, ".quiz-fog");
    expect(fog).toContain("transition: opacity 1000ms ease;");
    expect(fog).toContain("radial-gradient(");
    // Palette-only veil, and faded out well before the bottom of the viewport
    // (where the footer's own text sits, un-fogged).
    expect(fog).toMatch(/color-mix\(in srgb, var\(--accent-soft\) \d+%, var\(--accent\)\)/);
    expect(fog).toContain("transparent 72%");
  });

  it("mixes every tint from the existing tokens — no new hex", () => {
    expect(ACT2).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const tint of [0, 1, 2]) {
      const rule = block(ACT2, `.quiz-bloom-tint-${tint}`);
      expect(rule).toMatch(/--bloom-color: (var\(--accent\)|color-mix\(in srgb, var\(--accent\))/);
    }
  });

  it("goes static under prefers-reduced-motion: blooms at rest, fog without transition, no ripple", () => {
    // The last reduced-motion block is act 2's (act 1's is earlier in the file).
    const media = ACT2.lastIndexOf("@media (prefers-reduced-motion: reduce)");
    expect(media).toBeGreaterThan(-1);
    const reduced = ACT2.slice(media);

    expect(block(reduced, ".quiz-bloom")).toContain("animation: none;");
    expect(block(reduced, ".quiz-fog")).toContain("transition: none;");
    expect(block(reduced, ".quiz-pulse-layer")).toContain("display: none;");
  });
});
