import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ArchetypeRevealStage from "@/components/quiz/ArchetypeRevealStage";
import { SELECTION_BASIS } from "@/components/quiz/FragranceProfileCard";

/**
 * Batch 29 — the gold sparkle settle at the end of the archetype reveal.
 *
 * The owner approved one small finish: as the fog wipe lands and the emblem goes
 * sharp, five tiny gold ✦ burst once around it and fade. The strict part is the
 * timing — it must START inside the wipe-completion window and must never extend
 * the stage — so this suite pins the burst's window against the wipe's and the
 * CTA's, and pins that the existing beats were not touched.
 */

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const STAGE_SOURCE = readFileSync(
  new URL("../../components/quiz/ArchetypeRevealStage.tsx", import.meta.url),
  "utf8",
);
const RESULT_CARD_SOURCE = readFileSync(
  new URL("../../components/quiz/QuizResultCard.tsx", import.meta.url),
  "utf8",
);

const noop = (): void => undefined;

const stageMarkup = (): string =>
  renderToStaticMarkup(
    <ArchetypeRevealStage
      archetypeId="romantic"
      label="رز"
      selectionBasis={SELECTION_BASIS}
      onContinue={noop}
    />,
  ).replace(/<!--[\s\S]*?-->/g, "");

/** The full text of one `selector { … }` rule, brace-matched. */
function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `rule not found: ${selector}`).toBeGreaterThan(-1);

  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated rule: ${selector}`);
}

/** The stage's own motion contract, emitted inline with the component. */
const html = stageMarkup();

const SPARKLES = [
  "top",
  "upper-left",
  "upper-right",
  "left",
  "right",
] as const;

describe("reveal settle — the sparkles", () => {
  it("renders exactly five, decorative and positioned around the emblem", () => {
    const rendered = (
      html.match(
        /<span aria-hidden="true" class="archetype-sparkle archetype-sparkle--[a-z-]+">✦<\/span>/g,
      ) ?? []
    );
    expect(rendered).toHaveLength(5);

    // The approved spread: top-centre, two upper corners, and one either side.
    for (const position of SPARKLES) {
      expect(rendered.filter((tag) => tag.includes(`--${position}"`))).toHaveLength(1);
      expect(html).toContain(`.archetype-sparkle--${position} {`);
    }

    // Each is placed and drifts outward on its own vector, from the emblem's
    // own box — so the spread scales with the emblem across breakpoints.
    for (const position of SPARKLES) {
      const rule = block(html, `.archetype-sparkle--${position}`);
      expect(rule, `${position} has no position`).toMatch(/(left|top):/);
      expect(rule, `${position} has no outward drift`).toContain("--spark-x:");
      expect(rule).toContain("--spark-y:");
    }
    // They sit just outside the circle: above it and past either edge.
    expect(html).toContain("top: -1rem;");
    expect(html).toContain("left: 4%;");
    expect(html).toContain("left: 96%;");
    expect(html).toContain("left: calc(100% + 0.75rem);");
  });

  it("is gold, glyph-sized, and inert", () => {
    const base = block(html, ".archetype-sparkle");
    expect(base).toContain("color: var(--marker-gold);");
    expect(base).toContain("pointer-events: none;");
    expect(base).toContain("position: absolute;");

    const size = Number(base.match(/font-size: (\d+)px/)![1]);
    expect(size).toBeGreaterThanOrEqual(14);
    expect(size).toBeLessThanOrEqual(18);

    // Decoration only: never announced, never a target.
    expect(html).toContain(`aria-hidden="true"`);
    expect(base).toContain("opacity: 0;");
  });
});

describe("reveal settle — the timing contract", () => {
  it("bursts once, starting as the wipe completes", () => {
    const base = block(html, ".archetype-sparkle");
    const timing = base.match(
      /animation: archetype-sparkle-burst (\d+)ms ([a-z-]+) (\d+)ms forwards;/,
    );
    expect(timing, "the burst needs duration, easing, delay and forwards").not.toBeNull();

    const duration = Number(timing![1]);
    const delay = Number(timing![3]);

    expect(duration).toBe(900);
    expect(delay).toBe(1600);

    // Identical to the moment the wipe lands: 300ms delay + 1300ms wipe, and
    // inside the approved 1500–1700ms window.
    expect(html).toContain(
      "archetype-focus-wipe 1300ms cubic-bezier(0.22, 1, 0.36, 1) 300ms backwards",
    );
    expect(delay).toBe(300 + 1300);
    expect(delay).toBeGreaterThanOrEqual(1500);
    expect(delay).toBeLessThanOrEqual(1700);

    // One iteration, declared exactly once, never a loop.
    expect((html.match(/animation: archetype-sparkle-burst/g) ?? []).length).toBe(1);
    expect(base).not.toContain("infinite");
  });

  it("never extends the stage: it ends with the CTA", () => {
    const base = block(html, ".archetype-sparkle");
    const [, durationMs, , delayMs] = base.match(
      /animation: archetype-sparkle-burst (\d+)ms ([a-z-]+) (\d+)ms forwards;/,
    )!;

    // The stage's beats are unchanged: the CTA is still 1900ms + 600ms.
    expect(html).toContain("animation-delay:1500ms");
    expect(html).toContain("animation-delay:1700ms");
    expect(html).toContain("animation-delay:1900ms");
    expect(html).toContain(
      ".archetype-focus-line { animation: archetype-focus-line 600ms ease-out backwards; }",
    );

    const ctaEnd = 1900 + 600;
    expect(Number(delayMs) + Number(durationMs)).toBe(ctaEnd);

    // Declared after the line cascade, so the existing beat order is intact.
    expect(html.indexOf(".archetype-sparkle {")).toBeGreaterThan(
      html.indexOf(".archetype-focus-line { animation:"),
    );
  });

  it("fades in and out, drifting outward, and rests invisible", () => {
    const keyframes = block(html, "@keyframes archetype-sparkle-burst");

    expect(keyframes).toContain("opacity: 0;");
    expect(keyframes).toContain("opacity: 1;");
    // Outward: the end state is pushed away from the emblem on its own vector.
    expect(keyframes).toContain("translate(var(--spark-x), var(--spark-y))");

    const end = keyframes.slice(keyframes.lastIndexOf("100%"));
    expect(end, "the burst must end invisible").toContain("opacity: 0;");

    // Base state is already invisible, so the delay cannot flash a sparkle.
    expect(block(html, ".archetype-sparkle")).toContain("opacity: 0;");
    expect(block(html, ".archetype-sparkle")).toContain("forwards");
  });
});

describe("reveal settle — reduced motion and sharing", () => {
  it("does not render under reduced motion", () => {
    const media = html.indexOf("@media (prefers-reduced-motion: reduce) {");
    expect(media).toBeGreaterThan(-1);
    const reduced = html.slice(media);

    expect(reduced).toContain(".archetype-sparkle { display: none; }");
    // …and the wipe, sweep, glow and lines are still switched off there too.
    for (const name of [
      "archetype-focus-fog",
      "archetype-focus-sweep",
      "archetype-focus-glow",
      "archetype-focus-line",
    ]) {
      expect(reduced).toContain(`.${name}`);
    }
  });

  it("ships with the stage, once, and both consumers mount that stage", () => {
    // The motion lives next to the component (the file's own convention): there
    // is no second copy in the global stylesheet to drift out of sync.
    expect(CSS).not.toContain("archetype-sparkle");
    expect((STAGE_SOURCE.match(/@keyframes archetype-sparkle-burst/g) ?? []).length).toBe(1);
    expect((STAGE_SOURCE.match(/animation: archetype-sparkle-burst/g) ?? []).length).toBe(1);

    // The result phase renders the shared stage — no fork, no widget-only gate.
    expect(RESULT_CARD_SOURCE).toContain(
      'import ArchetypeRevealStage from "@/components/quiz/ArchetypeRevealStage"',
    );
    expect(STAGE_SOURCE).not.toMatch(/reducedMotion\s*[:=]\s*(true|false)/);

    // One style block, one heading: the stage's structure is unchanged.
    expect((html.match(/<style>/g) ?? []).length).toBe(1);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
  });
});
