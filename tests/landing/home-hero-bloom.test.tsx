import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

/**
 * Batch 33 — the static light bloom behind the homepage hero bottle.
 *
 * The owner approved a still sample: a warm gold glow behind the glass with a
 * fainter wine hint offset to one side, the same light family as the quiz
 * ambience. The load-bearing parts are that it stays STATIC (no animation,
 * keyframes or transition is introduced anywhere), that it is paint-only
 * behind an unchanged bottle + ground shadow, and that it cannot widen the page
 * on a phone.
 */

const PAGE_SOURCE = readFileSync(
  new URL("../../app/page.tsx", import.meta.url),
  "utf8",
);

const render = (): string =>
  renderToStaticMarkup(<Home />).replace(/<!--[\s\S]*?-->/g, "");

/** Landmarks inside the hero visual column. next/image encodes its src. */
const GOLD = "radial-gradient(58% 46% at 50% 42%";
const WINE = "radial-gradient(closest-side";
const BOTTLE = encodeURIComponent("/hero/fiage-hero-bottle.webp");
const SHADOW_CLASS =
  "absolute inset-x-10 bottom-1 h-8 rounded-[100%] bg-black/25 blur-2xl";

/** The opening <div …> tag whose inline style carries `marker`. */
function bloomTag(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at, `no bloom carrying ${marker}`).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<div", at);
  expect(open).toBeGreaterThan(-1);
  return html.slice(open, html.indexOf(">", at) + 1);
}

function classOf(tag: string): string {
  const match = tag.match(/class="([^"]*)"/);
  expect(match, `no class on ${tag}`).not.toBeNull();
  return match![1];
}

describe("homepage hero bloom", () => {
  const html = render();

  it("paints both layers behind the bottle and its ground shadow", () => {
    const goldAt = html.indexOf(GOLD);
    const wineAt = html.indexOf(WINE);
    // next/image preloads the asset from <head> and the header/footer marks are
    // also images, so anchor on the hero's own aspect-ratio box.
    const boxAt = html.indexOf('class="relative aspect-[293/669] w-full"');
    expect(boxAt, "the hero visual box is missing").toBeGreaterThan(-1);
    const bottleAt = html.indexOf(BOTTLE, boxAt);
    const shadowAt = html.indexOf(SHADOW_CLASS, boxAt);
    expect(bottleAt, "no bottle inside the hero box").toBeGreaterThan(boxAt);

    for (const [name, at] of [
      ["bottle", bottleAt],
      ["ground shadow", shadowAt],
    ] as const) {
      expect(at, `the ${name} is missing`).toBeGreaterThan(-1);
    }
    // Source order is paint order (all positioned, no z-index): the bloom comes
    // first, so the bottle and the shadow render above it.
    expect(goldAt).toBeLessThan(bottleAt);
    expect(wineAt).toBeLessThan(bottleAt);
    expect(bottleAt).toBeLessThan(shadowAt);
    // Exactly two decorative layers, both marked as such — scoped to the two
    // bloom boxes, since other decorative spans share that class prefix.
    expect(
      html.match(
        /aria-hidden="true" class="pointer-events-none absolute(?: inset-x-0| right-\[4%\])/g,
      ) ?? [],
    ).toHaveLength(2);
  });

  it("is decorative: aria-hidden and click-through on both layers", () => {
    for (const marker of [GOLD, WINE]) {
      const tag = bloomTag(html, marker);
      expect(tag).toContain('aria-hidden="true"');
      expect(tag).toContain("pointer-events-none");
      expect(tag).toContain("absolute");
    }
  });

  it("uses the palette's gold family for the big bloom", () => {
    const tag = bloomTag(html, GOLD);

    // The core is the approved ~34% alpha of --marker-gold, falling off a
    // warm mid stop and gone by 70% — a glow, not a disc.
    expect(tag).toContain("var(--marker-gold) 34%, transparent");
    expect(tag).toContain("var(--marker-gold) 17%, transparent");
    expect(tag).toContain("transparent 70%)");
    expect(tag).toContain("58% 46% at 50% 42%");
    // Behind the glass, not behind the copy column.
    expect(classOf(tag)).toContain("inset-x-0");
    expect(classOf(tag)).toContain("top-[2%]");
  });

  it("adds the fainter wine hint, offset to one side", () => {
    const tag = bloomTag(html, WINE);
    const cls = classOf(tag);

    expect(tag).toContain("var(--wine) 13%, transparent");
    expect(tag).toContain("var(--wine) 7%, transparent");
    expect(tag).toContain("closest-side");
    // Offset toward the glass edge rather than centred under the bottle.
    expect(cls).toContain("right-[4%]");
    expect(cls).toContain("top-[26%]");
    expect(cls).toContain("w-[62%]");
  });

  it("stays inside the column's box, so it can never widen the page", () => {
    for (const marker of [GOLD, WINE]) {
      const cls = classOf(bloomTag(html, marker));

      // No horizontal escape hatches: no negative offsets, no viewport-width
      // sizing, no sideways transform, no fixed pixel width.
      expect(cls).not.toMatch(/(^| )-(left|right|x|inset)-/);
      expect(cls).not.toMatch(/(^| )(left|right)-\[-/);
      expect(cls).not.toMatch(/w-(screen|full|\d+px)/);
      expect(cls).not.toMatch(/translate-x|scale-/);
      // Percentage insets keep it inside the 270–330px column at every width.
      expect(cls).toMatch(/inset-x-0|right-\[\d+%\]/);
    }
    // The column itself is unchanged: still the same max widths and the same
    // aspect-ratio box the bottle fills.
    expect(PAGE_SOURCE).toContain(
      'className="relative mx-auto w-full max-w-[270px] sm:max-w-[300px] lg:max-w-[330px]"',
    );
    expect(PAGE_SOURCE).toContain('className="relative aspect-[293/669] w-full"');
  });

  it("introduces no motion at all: no animation, keyframes or transition", () => {
    for (const marker of [GOLD, WINE]) {
      const tag = bloomTag(html, marker);
      expect(tag).not.toMatch(/animation|transition|keyframes/);
      // Only background paint is inline — no transforms to animate later.
      expect(tag).not.toMatch(/transform|will-change|@media/);
    }
    // Now the WHOLE module, comments included: prose may never name the words
    // the code must not use either, so the comment is worded around them rather
    // than stripped out of the scan (batch 42).
    expect(PAGE_SOURCE).not.toMatch(/\banimation|\btransition|@keyframes/);
    expect(PAGE_SOURCE).not.toContain("<style");
    expect(html).not.toContain("quiz-orb");
    expect(html).not.toContain("QuizAmbience");
  });

  it("leaves the bottle image and the ellipse ground shadow unchanged", () => {
    // The bottle still fills its box with the same asset and fit.
    expect(html).toContain(BOTTLE);
    expect(html).toContain("object-contain");
    expect(PAGE_SOURCE).toContain('src="/hero/fiage-hero-bottle.webp"');
    expect(PAGE_SOURCE).toContain("object-contain");
    // The shadow is the same single layer, after the bottle.
    expect(PAGE_SOURCE).toContain(`className="${SHADOW_CLASS}"`);
    expect(html.match(/bg-black\/25 blur-2xl/g) ?? []).toHaveLength(1);
    expect(html).toContain(SHADOW_CLASS);
  });
});
