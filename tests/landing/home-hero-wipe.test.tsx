import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

/**
 * Batch 31 — the marker-wipe on the homepage hero.
 *
 * The site's front door now uses the same shipped `MarkerWipe` as the quiz
 * intro: one gold block behind «خودتون». The strict parts are that the hero's
 * copy stays byte-identical, its two fixed lines (the «کنید» orphan guarantee)
 * stay intact, and the wipe still renders as a static highlight wherever motion
 * is unavailable.
 */

const PAGE_SOURCE = readFileSync(
  new URL("../../app/page.tsx", import.meta.url),
  "utf8",
);
const WIPE_SOURCE = readFileSync(
  new URL("../../components/quiz/MarkerWipe.tsx", import.meta.url),
  "utf8",
);
const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

const render = (): string =>
  renderToStaticMarkup(<Home />).replace(/<!--[\s\S]*?-->/g, "");

/** The hero H1 exactly as SSR emits it. */
function heroH1(html: string): string {
  const start = html.indexOf("<h1");
  expect(start, "the homepage has no h1").toBeGreaterThan(-1);
  const end = html.indexOf("</h1>", start);
  return html.slice(start, end + "</h1>".length);
}

/** The approved hero copy, unchanged by this batch. */
const HERO_TEXT = "عطر خودتون رو پیدا کنید";

describe("homepage hero wipe", () => {
  const html = render();
  const h1 = heroH1(html);

  it("wraps «خودتون» in the shipped MarkerWipe, exactly once", () => {
    expect(h1).toContain('<span class="marker-wipe">خودتون</span>');
    expect(h1.match(/class="marker-wipe/g) ?? []).toHaveLength(1);
    // One wipe on the whole page: the hero is the only display headline that
    // earns it, exactly like the quiz intro.
    expect(html.match(/class="marker-wipe/g) ?? []).toHaveLength(1);
    // The word appears once, inside the span — nothing is duplicated.
    expect(h1.match(/خودتون/g) ?? []).toHaveLength(1);
  });

  it("keeps the H1's text content byte-identical", () => {
    expect(h1.replace(/<[^>]*>/g, "")).toBe(HERO_TEXT);
  });

  it("keeps the two fixed lines, so «کنید» can never be orphaned", () => {
    expect(h1.match(/class="block"/g) ?? []).toHaveLength(2);
    // Sizes, leading and the exact line split are part of the guarantee.
    expect(h1).toBe(
      '<h1 class="font-heading text-4xl font-bold leading-[1.3] text-foreground sm:text-5xl lg:text-6xl">' +
        '<span class="block">عطر <span class="marker-wipe">خودتون</span> رو</span> ' +
        '<span class="block">پیدا کنید</span></h1>',
    );
    // «پیدا کنید» lives entirely in the second block.
    const [, second] = h1.split("<span class=\"block\">");
    expect(h1).toContain('<span class="block">پیدا کنید</span>');
    expect(second).toBeDefined();
  });

  it("leaves the rest of the hero untouched", () => {
    // Sub-copy, CTA and the caption are the approved copy, word for word.
    expect(html).toContain(
      "فقط ۱۰ سوال کوتاه؛ بعدش می‌فهمید کدوم رایحه واقعاً به سلیقه و شخصیتتون می‌خوره — نه بر اساس تبلیغ، بر اساس خودتون.",
    );
    expect(html).toContain("شروع آزمون");
    expect(html).toContain("حدود دو دقیقه وقت می‌گیره · بدون ثبت‌نام");
    // The bottle column is batch 33's business; its markup is not touched.
    // next/image serves it through the optimizer, so match the encoded src.
    expect(html).toContain(encodeURIComponent("/hero/fiage-hero-bottle.webp"));
    expect(html).toContain("object-contain");
  });

  it("imports the one implementation instead of forking it", () => {
    expect(PAGE_SOURCE).toContain(
      'import MarkerWipe from "@/components/quiz/MarkerWipe"',
    );
    expect(PAGE_SOURCE).toContain('replayKey="home-hero"');
    // No local copy of the span/class: one component serves both surfaces.
    expect(PAGE_SOURCE).not.toContain('className="marker-wipe');
  });
});

describe("homepage hero wipe under reduced motion", () => {
  it("renders the finished highlight statically (SSR / no-JS)", () => {
    const h1 = heroH1(render());

    // The wipe only ever arms via the observer; static markup is the finished
    // look, which is also what no-JS and reduced motion show.
    expect(h1).not.toContain("is-inview");
    expect(CSS).toContain(".marker-wipe::before {");
    expect(CSS).toContain("transform: scaleX(1);");
  });

  it("never arms the wipe when the preference asks for less motion", () => {
    // The component bails out before observing anything…
    expect(WIPE_SOURCE).toContain(
      'window.matchMedia("(prefers-reduced-motion: reduce)").matches',
    );
    // …and the stylesheet switches the draw off as well.
    expect(CSS).toContain("animation: marker-wipe-draw 550ms");
    const reducedAt = CSS.indexOf(
      "@media (prefers-reduced-motion: reduce) {\n  .marker-wipe.is-inview::before {",
    );
    expect(reducedAt, "no reduced-motion gate on the wipe").toBeGreaterThan(-1);
    expect(CSS.slice(reducedAt)).toContain("animation: none;");
  });
});
