import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TraitBars from "@/components/results/TraitBars";
import ResultsView from "@/components/results/ResultsView";
import { getArchetypeById } from "@/lib/personality/archetypes";
import { makeMatchResult, makeVector } from "@/tests/ai/fixtures";
import type { ResultsViewData } from "@/lib/results/service";

/**
 * Ceremonial section headlines — static-markup and contract tests.
 *
 * Same convention as the other UI suites (react-dom/server, no jsdom): the
 * fog-rise entrance itself is proven in the browser gate on the production
 * build (plays once on scroll into view, centered with a soft shadow). Here
 * the structure is locked: both headlines share the identical
 * `section-headline` treatment, server markup renders statically with no
 * `is-inview`, and the stylesheet carries the centered display face, the
 * blur-to-sharp rise and the reduced-motion bypass.
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

const root = new URL("../../", import.meta.url);
const read = (path: string): string =>
  readFileSync(new URL(path, root), "utf8");

const archetype = getArchetypeById("mysterious-explorer")!;
const vector = makeVector(50);

const viewData = (): ResultsViewData => ({
  recommendations: makeMatchResult().recommendations,
  explanations: new Map(),
  aiAvailable: false,
  isEmpty: false,
});

/** The class attribute of the h2 wrapping the given copy, if any. */
function headlineClass(html: string, copy: string): string | null {
  const index = html.indexOf(copy);
  if (index === -1) {
    return null;
  }
  const open = html.lastIndexOf("<h2", index);
  const close = html.indexOf(">", open);
  const tag = html.slice(open, close);
  return tag.match(/class="([^"]*)"/)?.[1] ?? null;
}

describe("results section headlines", () => {
  it("gives both headlines the identical section-headline treatment", () => {
    const view = render(
      <ResultsView vector={vector} archetype={archetype} data={viewData()} />,
    );
    const bars = render(<TraitBars vector={vector} />);

    const scent = headlineClass(view, "رایحه‌ای که بهتون میاد");
    const profile = headlineClass(bars, "پروفایل شخصیتی شما");

    expect(scent).not.toBeNull();
    expect(profile).not.toBeNull();
    expect(scent).toContain("section-headline");
    // Identical hierarchy: the very same treatment, not two lookalikes.
    expect(profile).toBe(scent);
  });

  it("renders statically in server markup (no entrance before scroll)", () => {
    const view = render(
      <ResultsView vector={vector} archetype={archetype} data={viewData()} />,
    );

    expect(view).not.toContain("is-inview");
    // Sub-texts stay static: no entrance classes on the copy around them.
    expect(view).toContain(archetype.fragranceHint);
  });

  it("styles the headline as a centered display face with a soft shadow", () => {
    const css = read("app/globals.css");
    const start = css.indexOf(".section-headline {");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("}", start));

    expect(block).toContain("text-align: center");
    expect(block).toContain("var(--font-display)");
    expect(block).toContain("text-shadow");
    expect(block).toContain("var(--foreground)");
  });

  it("rises blur-to-sharp once, and never under reduced motion", () => {
    const css = read("app/globals.css");

    expect(css).toContain("@keyframes section-headline-fog-rise");
    const frames = css.slice(css.indexOf("@keyframes section-headline-fog-rise"));
    expect(frames).toContain("blur(10px)");
    expect(frames).toContain("translateY(14px)");
    expect(frames).toContain("blur(0)");

    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain(".section-headline.is-inview");
    expect(reduced).toContain("animation: none");
  });
});
