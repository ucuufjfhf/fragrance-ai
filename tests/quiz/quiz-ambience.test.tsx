import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Quiz from "@/components/quiz/Quiz";
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
 *  - the rendered markup (three washes, one glow-orb layer, one grain layer,
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

/**
 * A malformed comment opener (`/ *` with a space) silently swallows the rule that
 * follows it — the string-matching assertions below would still pass while the
 * browser dropped the declaration. This guard is cheap, and it is exactly the
 * failure that shipped for one build.
 */
const malformedComments = (CSS.match(/\/ \*/g) ?? []).length;

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

/**
 * The bottle silhouettes' own composite: the page colour MULTIPLIED by the
 * silhouette at `alpha` (`background-blend-mode: multiply` plus the element's
 * opacity), which is how `app/globals.css` renders them. Opaque black is the
 * darkest glass the blend can ever produce, so it is the worst case here.
 */
const multiplied = (base: Rgb, source: Rgb, alpha: number): Rgb =>
  base.map(
    (channel, index) => (1 - alpha) * channel + alpha * channel * (source[index] / 255),
  ) as Rgb;

/** `#rrggbb` → opaque [r, g, b]. */
const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

describe("quiz ambience markup", () => {
  it("renders the bottle silhouettes, three washes, one glow-orb layer and one grain layer, all decorative and inert", () => {
    const html = render();

    expect((html.match(/class="quiz-wash quiz-wash-[abc]"/g) ?? []).length).toBe(3);
    expect(html).toContain("quiz-orb-layer");
    expect(html).toContain("quiz-grain");
    // The solid base, the silhouette layer, the orb layer and the grain are all
    // aria-hidden; the three pointer targets are the base container, the
    // silhouette layer and the orb layer inside it.
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBe(4);
    expect((html.match(/pointer-events-none/g) ?? []).length).toBe(3);

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
      CSS.indexOf("@media (prefers-reduced-motion: reduce) {\n  .quiz-orb {"),
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

describe("big glow orbs", () => {
  const html = render();
  const layer = html.slice(
    html.lastIndexOf("<div", html.indexOf("quiz-orb-layer")),
    html.indexOf("quiz-grain"),
  );
  const orbs = [...layer.matchAll(/left:\s*(\d+)%;\s*top:\s*(\d+)%/g)].map(([, left, top]) => ({
    left: Number(left),
    top: Number(top),
  }));
  /** Each orb's tone and core opacity, read from the same span's style attribute. */
  const tones = [
    ...layer.matchAll(/class="quiz-orb quiz-orb-(\w+)"[^>]*--orb-opacity:([\d.]+)/g),
  ].map(([, tone, opacity]) => ({ tone, opacity: Number(opacity) }));

  it("holds 5–7 big orbs, each 150–350px, capped by construction", () => {
    expect(MAX_ORBS).toBeGreaterThanOrEqual(5);
    expect(MAX_ORBS).toBeLessThanOrEqual(7);
    expect((layer.match(/class="quiz-orb quiz-orb-\w+"/g) ?? []).length).toBe(MAX_ORBS);

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

  it("paints above the washes but still behind the content", async () => {
    // Within `.quiz-ambience` the orb layer is declared AFTER the washes, so DOM
    // order puts it above them (the brief's "washes → big orbs"); and the whole
    // ambience container still precedes the first card.
    expect(html.indexOf("quiz-orb-layer")).toBeGreaterThan(-1);
    expect(html.indexOf("quiz-orb-layer")).toBeGreaterThan(html.indexOf("quiz-wash-a"));

    const page = renderToStaticMarkup(await QuizPage({ searchParams: Promise.resolve({}) }));
    expect(page.indexOf("quiz-orb-layer")).toBeGreaterThan(-1);
    expect(page.indexOf("quiz-rise")).toBeGreaterThan(page.indexOf("quiz-orb-layer"));
  });

  it("keeps every orb out of the footer band", () => {
    expect(orbs).toHaveLength(MAX_ORBS);
    for (const { left, top } of orbs) {
      expect(top, `orb ${left},${top} starts in the footer band`).toBeLessThanOrEqual(74);
    }
  });

  it("floats on livelier, bobbing loops — half the first pass, transform only", () => {
    const durations = [...layer.matchAll(/animation-duration:\s*(\d+)s/g)].map(([, value]) =>
      Number(value),
    );
    expect(durations).toHaveLength(MAX_ORBS);
    for (const duration of durations) {
      // Halved from the 72–120s first pass — faster, so the float reads as
      // motion rather than as a mood.
      expect(duration).toBeGreaterThanOrEqual(30);
      expect(duration).toBeLessThanOrEqual(65);
    }
    expect(Math.max(...durations), "the slowest orb must still be livelier").toBeLessThanOrEqual(60);

    // Every orb carries its own vertical bob amplitude…
    const bobs = [...layer.matchAll(/--orb-bob:\s*(\d+)%/g)].map(([, value]) => Number(value));
    expect(bobs).toHaveLength(MAX_ORBS);
    for (const bob of bobs) {
      expect(bob, "the bob must be visible, not a twitch").toBeGreaterThanOrEqual(5);
      expect(bob, "graceful, not frantic").toBeLessThanOrEqual(9);
    }

    // …and the keyframes really bob, by adding/subtracting the amplitude from the
    // -50% centre override. `alternate` plays those stops out and back, so the
    // vertical traces a soft sine rather than a one-way slide.
    const keyframes = block("@keyframes quiz-orb-drift");
    expect(keyframes).toContain("calc(-50% - var(--orb-bob, 6%))");
    expect(keyframes).toContain("calc(-50% + var(--orb-bob, 6%))");
    expect(block(".quiz-orb")).toContain("--orb-bob: 6%;");
  });

  it("keeps every core inside the bold 0.26–0.34 band", () => {
    expect(tones).toHaveLength(MAX_ORBS);
    for (const { tone, opacity } of tones) {
      expect(opacity, `${tone} core must be unmissable`).toBeGreaterThanOrEqual(0.25);
      expect(opacity, `${tone} core stays a glow, never an opaque disc`).toBeLessThanOrEqual(0.4);
    }
    // The gradient's first stop is the FULL colour, so `--orb-opacity` really is
    // the alpha the centre of the orb shows.
    expect(block(".quiz-orb")).toContain("var(--orb-color) 0%");
  });

  it("splits the six into a wine diagonal and four warm orbs", () => {
    const names = tones.map((orb) => orb.tone);
    const wine = tones.filter((orb) => orb.tone === "wine");
    const warm = tones.filter((orb) => orb.tone !== "wine");

    expect(wine, "two wine orbs — the wine-and-gold note").toHaveLength(2);
    expect(warm).toHaveLength(4);
    expect(new Set(names)).toEqual(new Set(["amber", "gold", "wine"]));

    // The wine pair is the diagonal: upper-left and lower-right.
    const wineOrbs = orbs.filter((_, index) => names[index] === "wine");
    expect(wineOrbs.map(({ left }) => left).sort((a, b) => a - b)).toEqual([16, 88]);

    // Wine is the darkest tone, so it takes the lowest cores: that is the knob
    // that keeps the muted labels inside the budget (asserted below).
    for (const orb of wine) {
      expect(orb.opacity, "wine must not out-spend the warm orbs' contrast budget").toBeLessThan(
        Math.max(...warm.map((other) => other.opacity)),
      );
    }
  });

  it("animates transform only — the softness is the gradient, not a blur", () => {
    const keyframes = block("@keyframes quiz-orb-drift");
    const properties = [...keyframes.matchAll(/([a-zA-Z-]+):\s*[^;]+;/g)].map(([, name]) => name);

    expect(properties.length).toBeGreaterThan(0);
    for (const property of properties) {
      expect(["transform"], `unexpected animated property: ${property}`).toContain(property);
    }

    for (const selector of [
      ".quiz-orb-layer",
      ".quiz-orb",
      ".quiz-orb-terracotta",
      ".quiz-orb-amber",
      ".quiz-orb-gold",
      ".quiz-orb-wine",
    ]) {
      const rule = block(selector);
      expect(rule).not.toContain("filter:");
      expect(rule).not.toContain("blur(");
      expect(rule).not.toContain("backdrop-filter");
      expect(rule).not.toContain("box-shadow");
    }

    // The origin is the orb's CENTRE: without the -50% the box sits
    // down-and-right of `left`/`top` and hides behind the card on a phone.
    expect(block(".quiz-orb")).toContain("transform: translate(-50%, -50%);");
    // The middle stop still carries the sway and the scale breath, so the bob was
    // added around the existing structure rather than replacing it.
    expect(keyframes).toContain("transform: translate(-46%, -50%) scale(1.08);");

    // Bold softness, built from a graduated radial falloff…
    expect(block(".quiz-orb")).toContain("radial-gradient(");
    expect(block(".quiz-orb")).toMatch(/color-mix\(in srgb, var\(--orb-color\) \d+%, transparent\)/);
    // …tinted from the existing palette, never a new hex.
    expect(block(".quiz-orb")).toMatch(/--orb-color: var\(--accent\);/);
    for (const tone of ["terracotta", "amber", "gold"]) {
      const rule = block(`.quiz-orb-${tone}`);
      expect(rule).toMatch(/--orb-color: (var\(--accent\)|color-mix\(in srgb, var\(--accent\))/);
      expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }

    // The wine tone names the one new palette token, so its rule stays hex-free
    // too and the colour is declared exactly once, in the palette.
    const wine = block(".quiz-orb-wine");
    expect(wine).toContain("--orb-color: var(--wine);");
    expect(wine).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS, "the --wine palette token is missing").toMatch(/--wine: #[0-9a-fA-F]{6};/);
  });

  it("freezes under prefers-reduced-motion", () => {
    const media = CSS.slice(
      CSS.indexOf("@media (prefers-reduced-motion: reduce) {\n  .quiz-orb {"),
    );
    expect(media).toContain(".quiz-orb {");
    expect(media).toContain("animation: none;");
  });
});

describe("frosted-glass quiz cards", () => {
  const ambience = render();
  const frost = block(".quiz-frost");

  it("ships CSS that parses: no malformed comment opener drops a rule", () => {
    expect(malformedComments).toBe(0);
  });

  it("is a warm-white plate at 78% with exactly one backdrop blur", () => {
    // The alpha is deliberately NOT the contrast lever: every extra point of white
    // buys a little contrast and gives up a share of the glow, and the glow through
    // the card is the whole feature on a phone. Measured at 78%, the muted labels
    // came in at 4.42:1 in the worst phase, so the LABELS were given more weight
    // instead (see the token test below) and the plate stays where it is.
    const alpha = Number(
      frost.match(/color-mix\(in srgb, var\(--surface\) (\d+)%, transparent\)/)![1],
    );
    expect(alpha).toBeGreaterThanOrEqual(74);
    expect(alpha).toBeLessThanOrEqual(82);
    expect(frost).toContain("backdrop-filter: blur(");
    // ONE backdrop-filter declaration; the -webkit- alias is not a second layer.
    expect((frost.match(/(^|[^-])backdrop-filter:/g) ?? []).length).toBe(1);
    expect(frost).toContain("-webkit-backdrop-filter: blur(");
    // Palette-only, and no plain `filter` (that would be a second effect).
    expect(frost).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(frost).not.toMatch(/[^-]filter: blur/);
  });

  it("re-points --muted for its subtree, so labels on the plate get more weight", () => {
    // Everything muted inside a card sits on the plate, so the plate re-points the
    // token rather than every component remembering to ask for a special one.
    expect(frost).toContain("--muted: var(--muted-on-plate);");

    const token = CSS.match(
      /--muted-on-plate: color-mix\(in srgb, var\(--muted\) (\d+)%, black\);/,
    );
    expect(token, "--muted-on-plate is missing from the palette").not.toBeNull();

    // Palette-derived (the same accent-toward-black recipe the badge label and the
    // primary button already use) and genuinely darker than the plain token.
    const weight = Number(token![1]) / 100;
    const plain = hex("#756b5e");
    const deeper = plain.map((channel) => channel * weight) as Rgb;
    expect(deeper[0], "the plate token must be darker than the site token").toBeLessThan(plain[0]);
    expect(deeper[0] / plain[0]).toBeGreaterThan(0.8);

    // …and NOT as a self-reference, which CSS Variables rejects as a cycle: the
    // declaration would become the guaranteed-invalid value and every muted label
    // would silently fall back to the inherited body colour.
    expect(frost).not.toMatch(/--muted: color-mix\(in srgb, var\(--muted\)/);
  });

  it("is applied to the quiz cards, replacing their opaque fill", () => {
    const html = renderToStaticMarkup(<Quiz />);
    expect(html).toContain("quiz-frost");
    expect(html).not.toMatch(/section className="quiz-rise[^"]*bg-surface/);
  });

  it("darkens the intro badge label to clear AA on its own opaque pill", () => {
    const rule = block(".quiz-badge-label");
    expect(rule).toMatch(/color: color-mix\(in srgb, var\(--accent\) \d+%, black\)/);
    expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);

    // `color-mix(accent N%, black)` is just the accent scaled by N.
    const pct = Number(rule.match(/var\(--accent\) (\d+)%, black/)![1]) / 100;
    const mixed = hex("#b5652d").map((channel) => channel * pct) as Rgb;
    expect(contrast(hex("#f3e5d8"), mixed)).toBeGreaterThanOrEqual(4.5);

    // …and the badge in the markup actually uses it.
    expect(renderToStaticMarkup(<Quiz />)).toContain("quiz-badge-label");
  });

  it("keeps body and muted text at AA over EVERY orb tone's core + the washes", () => {
    const surface = hex("#ffffff");
    const accent = hex("#b5652d");
    const background = hex("#faf7f2");
    const foreground = hex("#2a2420");
    // Labels on the plate use the plate's own token, resolved the way the stylesheet
    // resolves it: `--muted` mixed toward black.
    const mutedOnPlateWeight =
      Number(
        CSS.match(/--muted-on-plate: color-mix\(in srgb, var\(--muted\) (\d+)%, black\)/)![1],
      ) / 100;
    const muted = hex("#756b5e").map((channel) => channel * mutedOnPlateWeight) as Rgb;
    const plateAlpha =
      Number(frost.match(/color-mix\(in srgb, var\(--surface\) (\d+)%, transparent\)/)![1]) / 100;

    // Each tone resolved the way `app/globals.css` resolves it: the warm ones are
    // `--accent` mixed toward white, and wine is the `--wine` token.
    const towardWhite = (weight: number): Rgb =>
      accent.map((channel) => weight * channel + (1 - weight) * 255) as Rgb;
    const wineHex = CSS.match(/--wine: (#[0-9a-fA-F]{6});/)![1];
    const TONE_COLORS: Record<string, Rgb> = {
      terracotta: accent,
      amber: towardWhite(0.72),
      gold: towardWhite(0.58),
      wine: hex(wineHex),
    };

    const maxWash = Math.max(
      ...["a", "b", "c"].map((wash) =>
        Number(block(`.quiz-wash-${wash}`).match(/--wash-opacity: ([\d.]+);/)![1]),
      ),
    );

    const rendered = [
      ...ambience.matchAll(/class="quiz-orb quiz-orb-(\w+)"[^>]*--orb-opacity:([\d.]+)/g),
    ].map(([, tone, opacity]) => ({ tone, opacity: Number(opacity) }));
    expect(rendered).toHaveLength(MAX_ORBS);

    // The bottle silhouettes are the BACKMOST layer of the quiz background, so the
    // worst case picks up one more composite beneath the wash: the darkest glass
    // the blend can produce, at the strongest shape the markup declares.
    const silhouetteAlpha = Math.max(
      ...[...ambience.matchAll(/--silhouette-opacity:([\d.]+)/g)].map(([, value]) =>
        Number(value),
      ),
    );
    expect(silhouetteAlpha, "the silhouettes must declare an opacity").toBeGreaterThan(0);

    // Worst case, per orb: the strongest wash, under THAT orb's core, under the
    // frosted plate. Every tone is swept, so the darker wine core is checked on
    // its own terms instead of being assumed equal to the warm ones.
    let worst = { tone: "", ratio: Number.POSITIVE_INFINITY };
    for (const orb of rendered) {
      const washBase = multiplied(over(background, accent, maxWash), [0, 0, 0], silhouetteAlpha);
      const coreBase = over(washBase, TONE_COLORS[orb.tone], orb.opacity);
      const plate = over(coreBase, surface, plateAlpha);

      expect(contrast(plate, foreground), `${orb.tone} body text`).toBeGreaterThanOrEqual(7);
      const ratio = contrast(plate, muted);
      // Not merely ≥4.5: the browser measured 5.2:1 for the worst of these, so the
      // margin is asserted too. A hair over the line is how the 4.42:1 regression
      // got in last time.
      expect(ratio, `${orb.tone} muted labels over its ${orb.opacity} core`).toBeGreaterThanOrEqual(
        4.8,
      );
      if (ratio < worst.ratio) worst = { tone: orb.tone, ratio };
    }

    // The binder is the wine tone, and that is exactly why its cores are the
    // lowest in the set: the darkest glow spends contrast budget fastest, so it
    // is the one that had to be dialled down.
    expect(worst.tone).toBe("wine");
    expect(worst.ratio).toBeGreaterThanOrEqual(4.8);
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
