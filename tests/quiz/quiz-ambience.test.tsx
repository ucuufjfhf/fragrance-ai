import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import QuizAmbience from "@/components/quiz/QuizAmbience";
import QuizPage from "@/app/quiz/page";

/**
 * Quiz ambience contract.
 *
 * The layers are CSS-only, so this suite checks the two halves separately:
 *  - the rendered markup (three washes, one grain layer, inert and decorative),
 *  - the rules in `app/globals.css` that make the effect what it is — the
 *    timestamped band, easing, compositor-only properties, palette sourcing,
 *    the reduced-motion freeze and the contrast budget.
 *
 * Nothing here is a snapshot of the visuals: every assertion is one of the
 * brief's hard constraints, so a future edit that breaks one fails loudly.
 */

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

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

const render = () => renderToStaticMarkup(<QuizAmbience />).replace(/<!--[\s\S]*?-->/g, "");

type Rgb = [number, number, number];

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

/** `source` at `alpha` over `base` (both opaque, 0–255 per channel). */
const over = (base: Rgb, source: Rgb, alpha: number): Rgb =>
  base.map((channel, index) => (1 - alpha) * channel + alpha * source[index]) as Rgb;

describe("quiz ambience markup", () => {
  it("renders three washes and one grain layer, both decorative and inert", () => {
    const html = render();

    expect((html.match(/class="quiz-wash quiz-wash-[abc]"/g) ?? []).length).toBe(3);
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBe(2);
    expect(html).toContain("quiz-grain");

    // Decorative means inert: no pointer target on either layer.
    expect(html).toContain("quiz-ambience pointer-events-none fixed inset-0 -z-10 overflow-hidden");
    expect((html.match(/pointer-events-none/g) ?? []).length).toBe(1);
  });

  it("stays behind the quiz content and carries no emoji or copy", () => {
    const html = render();

    // Behind: the washes are the only -z-10 layer on the route.
    expect(html).toContain("-z-10");
    // Nothing user-facing to translate, and nothing to announce.
    expect(html).not.toMatch(/[^\x00-\x7F]/);
    expect(html).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it("is what the quiz route renders", async () => {
    const page = await QuizPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("quiz-ambience");
    expect(html).toContain("quiz-grain");
    // …and the flow it sits behind is unchanged.
    expect(html).toContain("شروع آزمون");
  });
});

describe("ambient breathing gradient", () => {
  it("keeps the cream base", () => {
    expect(block(".quiz-ambience")).toContain("background-color: var(--background);");
  });

  it("breathes on a 13–19s ease-in-out alternate loop, one per wash", () => {
    const base = block(".quiz-wash");
    expect(base).toContain("animation-name: quiz-wash-breathe;");
    expect(base).toContain("animation-timing-function: ease-in-out;");
    expect(base).toContain("animation-iteration-count: infinite;");
    expect(base).toContain("animation-direction: alternate;");

    const durations = ["a", "b", "c"].map((wash) => {
      const match = block(`.quiz-wash-${wash}`).match(/animation-duration: (\d+)s;/);
      expect(match, `no duration on wash ${wash}`).not.toBeNull();
      return Number(match![1]);
    });

    for (const duration of durations) {
      expect(duration).toBeGreaterThanOrEqual(12);
      expect(duration).toBeLessThanOrEqual(20);
    }
    // Staggered: three different loop lengths, so they never pulse together.
    expect(new Set(durations).size).toBe(3);
  });

  it("animates transform and opacity only — no layout, no paint", () => {
    const keyframes = block("@keyframes quiz-wash-breathe");
    const properties = [...keyframes.matchAll(/([a-zA-Z-]+):\s*[^;]+;/g)].map(([, name]) => name);

    expect(properties.length).toBeGreaterThan(0);
    for (const property of properties) {
      expect(["transform", "opacity"], `unexpected animated property: ${property}`).toContain(
        property,
      );
    }
    expect(keyframes).not.toContain("filter:");
    expect(keyframes).not.toContain("blur(");
    expect(keyframes).not.toMatch(/\b(width|height|top|left|margin|padding):/);
  });

  it("stays barely-there: peak wash opacity inside a 0.05–0.14 band", () => {
    for (const wash of ["a", "b", "c"]) {
      const match = block(`.quiz-wash-${wash}`).match(/--wash-opacity: ([\d.]+);/);
      expect(match, `no --wash-opacity on wash ${wash}`).not.toBeNull();
      const opacity = Number(match![1]);
      expect(opacity).toBeGreaterThanOrEqual(0.05);
      expect(opacity).toBeLessThanOrEqual(0.14);
    }
  });

  it("takes its colour from the existing tokens, never a new hex", () => {
    for (const selector of [".quiz-ambience", ".quiz-wash", ".quiz-wash-a", ".quiz-wash-b", ".quiz-wash-c"]) {
      expect(block(selector)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
    expect(block(".quiz-wash-b")).toContain("color-mix(in srgb, var(--accent) 55%, var(--accent-soft))");
  });

  it("freezes under prefers-reduced-motion", () => {
    const media = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce) {\n  .quiz-wash {"));
    expect(media).toContain("animation: none;");
    expect(media).toContain("transform: none;");
    // Still visible when frozen — it is depth, not motion.
    expect(media).toMatch(/opacity: calc\(var\(--wash-opacity, [\d.]+\) \* [\d.]+\);/);
  });
});

describe("film grain", () => {
  it("is a static, seamless feTurbulence tile inside the 0.03–0.05 band", () => {
    const grain = block(".quiz-grain");
    const opacity = Number(grain.match(/opacity: ([\d.]+);/)![1]);

    expect(opacity).toBeGreaterThanOrEqual(0.03);
    expect(opacity).toBeLessThanOrEqual(0.05);

    expect(grain).toContain("feTurbulence");
    expect(grain).toContain("type='fractalNoise'");
    expect(grain).toContain("stitchTiles='stitch'");
    expect(grain).toContain("feColorMatrix type='saturate' values='0'");
    expect(grain).toContain("background-repeat: repeat;");

    // Grain has to be texture, not a flat tint: feTurbulence's own alpha is
    // noisy, so it is forced opaque, and fractalNoise clusters around mid-grey,
    // so the channels are contrast-stretched. Without either, the overlay
    // measures as a uniform wash (verified on the built app).
    expect(grain).toContain("feFuncA type='linear' slope='0' intercept='1'");
    expect(grain).toContain("feFuncR type='linear' slope='2.2' intercept='-0.6'");
    // Inert overlay, and never animated: nothing to freeze under reduced motion.
    expect(grain).toContain("pointer-events: none;");
    expect(grain).not.toContain("animation");
    expect(grain).toMatch(/opacity: [\d.]+;\n {2}background-image:/);
  });

  it("sits above the route's own chrome so it textures the quiz surfaces", () => {
    // The sticky header is z-40 (components/site/SiteHeader.tsx): the grain has
    // to clear it to be a texture over the surfaces, not just the margins.
    expect(Number(block(".quiz-grain").match(/z-index: (\d+);/)![1])).toBeGreaterThan(40);
  });

  it("leaves the card's text contrast untouched in the worst case", () => {
    const alpha = Number(block(".quiz-grain").match(/opacity: ([\d.]+);/)![1]);
    const surface: Rgb = [255, 255, 255];
    const foreground: Rgb = [42, 36, 32];

    const clean = contrast(surface, foreground);
    // Worst case: the noise drives the background as dark and the glyphs as
    // light as it can, at the same time, on the same pixel.
    const grainy = contrast(over(surface, [0, 0, 0], alpha), over(foreground, [255, 255, 255], alpha));

    expect(clean).toBeCloseTo(15.3, 0);
    expect(grainy).toBeGreaterThanOrEqual(7); // WCAG AAA for body text
    expect(grainy).toBeGreaterThan(10);
    expect(grainy / clean).toBeGreaterThan(0.75);
  });
});
