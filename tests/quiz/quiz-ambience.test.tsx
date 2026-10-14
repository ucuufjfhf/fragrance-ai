import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import QuizAmbience, {
  MAX_ORBS,
  ORB_MAX_SIZE_PX,
  ORB_MIN_SIZE_PX,
} from "@/components/quiz/QuizAmbience";
import QuizPage from "@/app/quiz/page";

/**
 * Quiz ambience contract.
 *
 * The layers are CSS-only, so this suite checks the two halves separately:
 *  - the rendered markup (three washes, one bokeh-orb layer, one grain layer,
 *    all inert and decorative),
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

/** `#rrggbb` → opaque [r, g, b]. */
const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

describe("quiz ambience markup", () => {
  it("renders three washes, one bokeh-orb layer and one grain layer, all decorative and inert", () => {
    const html = render();

    expect((html.match(/class="quiz-wash quiz-wash-[abc]"/g) ?? []).length).toBe(3);
    expect(html).toContain("quiz-bokeh-layer");
    expect(html).toContain("quiz-grain");
    // The solid base, the orb layer and the grain are all aria-hidden; the two
    // pointer targets are the base container and the orb layer inside it.
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBe(3);
    expect((html.match(/pointer-events-none/g) ?? []).length).toBe(2);

    // Decorative means inert: no pointer target on any layer.
    expect(html).toContain("quiz-ambience pointer-events-none fixed inset-0 -z-10 overflow-hidden");
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

  it("stays barely-there: peak wash opacity inside a fuller 0.05–0.17 band", () => {
    const peaks = ["a", "b", "c"].map((wash) => {
      const match = block(`.quiz-wash-${wash}`).match(/--wash-opacity: ([\d.]+);/);
      expect(match, `no --wash-opacity on wash ${wash}`).not.toBeNull();
      return Number(match![1]);
    });

    for (const opacity of peaks) {
      expect(opacity).toBeGreaterThanOrEqual(0.05);
      expect(opacity).toBeLessThanOrEqual(0.17);
    }
    // The nudge: at least one wash must actually be fuller than the 0.12 ceiling
    // of the first pass, or the air never got denser.
    expect(Math.max(...peaks)).toBeGreaterThan(0.12);
  });

  it("takes its colour from the existing tokens, never a new hex", () => {
    for (const selector of [".quiz-ambience", ".quiz-wash", ".quiz-wash-a", ".quiz-wash-b", ".quiz-wash-c"]) {
      expect(block(selector)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
    expect(block(".quiz-wash-b")).toContain("color-mix(in srgb, var(--accent) 55%, var(--accent-soft))");
  });

  it("freezes under prefers-reduced-motion", () => {
    const media = CSS.slice(
      CSS.indexOf("@media (prefers-reduced-motion: reduce) {\n  .quiz-bokeh {"),
    );
    expect(media).toContain(".quiz-wash {");
    expect(media).toContain("animation: none;");
    expect(media).toContain("transform: none;");
    // Still visible when frozen — it is depth, not motion.
    expect(media).toMatch(/opacity: calc\(var\(--wash-opacity, [\d.]+\) \* [\d.]+\);/);
  });

  it("keeps the header's muted links readable over the strongest wash", () => {
    // Readability first: the washes only tint the page base, so the only text
    // they can affect is the header's, behind its 85% cream plate. Worst case —
    // the strongest declared wash at its darkest mix (`--accent`) sitting under
    // that plate — the muted link must still clear WCAG AA.
    const background = hex("#faf7f2");
    const accent = hex("#b5652d");
    const muted = hex("#756b5e");

    const washAlpha = Math.max(
      ...["a", "b", "c"].map((wash) =>
        Number(block(`.quiz-wash-${wash}`).match(/--wash-opacity: ([\d.]+);/)![1]),
      ),
    );

    const tintedBase = over(background, accent, washAlpha);
    const plate = over(tintedBase, background, 0.85);

    expect(contrast(plate, muted)).toBeGreaterThanOrEqual(4.5);

    // …and the card's own text is untouched: the washes never sit under it.
    expect(contrast(hex("#ffffff"), hex("#2a2420"))).toBeGreaterThan(15);
  });
});

describe("bokeh orbs", () => {
  const html = render();
  const layer = html.slice(
    html.lastIndexOf("<div", html.indexOf("quiz-bokeh-layer")),
    html.indexOf("quiz-wash"),
  );
  const orbs = [...layer.matchAll(/left:\s*(\d+)%;\s*top:\s*(\d+)%/g)].map(([, left, top]) => ({
    left: Number(left),
    top: Number(top),
  }));

  it("holds 6–8 orbs, each 60–140px, capped by construction", () => {
    expect(MAX_ORBS).toBeGreaterThanOrEqual(6);
    expect(MAX_ORBS).toBeLessThanOrEqual(8);
    expect((layer.match(/class="quiz-bokeh"/g) ?? []).length).toBe(MAX_ORBS);

    const sizes = [...layer.matchAll(/width:\s*(\d+)px/g)].map(([, size]) => Number(size));
    expect(sizes).toHaveLength(MAX_ORBS);
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(ORB_MIN_SIZE_PX);
      expect(size).toBeLessThanOrEqual(ORB_MAX_SIZE_PX);
    }
  });

  it("is decorative and inert", () => {
    expect(layer).toContain('aria-hidden="true"');
    expect(layer).toContain("pointer-events-none");
  });

  it("paints in the DEEP background: before the washes, behind the content", async () => {
    // Within `.quiz-ambience` the orb layer is declared first, so DOM order puts
    // it beneath the washes; and the whole ambience container precedes the card.
    expect(html.indexOf("quiz-bokeh-layer")).toBeGreaterThan(-1);
    expect(html.indexOf("quiz-wash-a")).toBeGreaterThan(html.indexOf("quiz-bokeh-layer"));

    const page = renderToStaticMarkup(await QuizPage({ searchParams: Promise.resolve({}) }));
    expect(page.indexOf("quiz-bokeh-layer")).toBeGreaterThan(-1);
    expect(page.indexOf("quiz-rise")).toBeGreaterThan(page.indexOf("quiz-bokeh-layer"));
  });

  it("keeps every orb out of the footer band", () => {
    expect(orbs).toHaveLength(MAX_ORBS);
    for (const { left, top } of orbs) {
      expect(top, `orb ${left},${top} starts in the footer band`).toBeLessThanOrEqual(74);
    }
  });

  it("drifts extremely slowly at very low opacity", () => {
    const durations = [...layer.matchAll(/animation-duration:\s*(\d+)s/g)].map(([, value]) =>
      Number(value),
    );
    expect(durations).toHaveLength(MAX_ORBS);
    for (const duration of durations) {
      expect(duration).toBeGreaterThanOrEqual(60);
      expect(duration).toBeLessThanOrEqual(120);
    }

    const opacities = [...layer.matchAll(/--orb-opacity:\s*([\d.]+)/g)].map(([, value]) =>
      Number(value),
    );
    expect(opacities).toHaveLength(MAX_ORBS);
    for (const opacity of opacities) {
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThanOrEqual(0.14);
    }
  });

  it("animates transform and opacity only — the softness is the gradient, not a blur", () => {
    const keyframes = block("@keyframes quiz-bokeh-drift");
    const properties = [...keyframes.matchAll(/([a-zA-Z-]+):\s*[^;]+;/g)].map(([, name]) => name);

    expect(properties.length).toBeGreaterThan(0);
    for (const property of properties) {
      expect(["transform", "opacity"], `unexpected animated property: ${property}`).toContain(
        property,
      );
    }

    for (const selector of [".quiz-bokeh-layer", ".quiz-bokeh"]) {
      const rule = block(selector);
      expect(rule).not.toContain("filter:");
      expect(rule).not.toContain("blur(");
      expect(rule).not.toContain("backdrop-filter");
      expect(rule).not.toContain("box-shadow");
    }

    // The origin is the orb's CENTRE: without the -50% the box sits
    // down-and-right of `left`/`top` and hides behind the card on a phone.
    expect(block(".quiz-bokeh")).toContain("transform: translate(-50%, -50%);");
    expect(keyframes).toContain("transform: translate(-50%, -50%) scale(1);");

    // Heavy out-of-focus softness, built from a graduated radial falloff…
    expect(block(".quiz-bokeh")).toContain("radial-gradient(");
    expect(block(".quiz-bokeh")).toMatch(
      /color-mix\(in srgb, var\(--orb-color\) \d+%, transparent\)/,
    );
    // …tinted from the existing palette, never a new hex.
    expect(block(".quiz-bokeh")).toMatch(/--orb-color: var\(--accent\);/);
    expect(block(".quiz-bokeh")).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("freezes under prefers-reduced-motion", () => {
    const media = CSS.slice(
      CSS.indexOf("@media (prefers-reduced-motion: reduce) {\n  .quiz-bokeh {"),
    );
    expect(media).toContain(".quiz-bokeh {");
    expect(media).toContain("animation: none;");
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
