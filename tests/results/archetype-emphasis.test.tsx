import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ResultsView from "@/components/results/ResultsView";
import { ARCHETYPES } from "@/lib/personality/archetypes";
import type { ResultsViewData } from "@/lib/results/service";
import { makeMatchResult, makeVector } from "@/tests/ai/fixtures";

/**
 * The archetype description's trait-word emphasis — the results header only.
 *
 * Same convention as the sibling results suites (react-dom/server, no jsdom).
 * The copy is the contract here: the renderer may only wrap stored words, so
 * these pins prove the markup changes presentation and nothing else, and that
 * the band's colour comes from the archetype's own `--accent`.
 */

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const VIEW_SOURCE = readFileSync(
  new URL("../../components/results/ResultsView.tsx", import.meta.url),
  "utf8",
);

/** The full text of one `selector { … }` rule (brace-matched). */
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

const render = (element: ReactElement): string =>
  renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");

const viewData = (): ResultsViewData => ({
  recommendations: makeMatchResult().recommendations,
  explanations: new Map(),
  aiAvailable: true,
  isEmpty: false,
});

/** The header paragraph that carries the archetype description. */
const DESCRIPTION_PARAGRAPH =
  /<p class="quiz-rise max-w-md text-sm leading-8 text-foreground\/80"[^>]*>([\s\S]*?)<\/p>/;

const renderDescription = (archetypeId: string): { html: string; paragraph: string } => {
  const archetype = ARCHETYPES.find((candidate) => candidate.id === archetypeId)!;
  const html = render(
    <ResultsView vector={makeVector(50)} archetype={archetype} data={viewData()} />,
  );
  return { html, paragraph: html.match(DESCRIPTION_PARAGRAPH)?.[1] ?? "" };
};

describe("archetype description emphasis", () => {
  it("bands exactly the declared trait words, for every archetype", () => {
    for (const archetype of ARCHETYPES) {
      const { html } = renderDescription(archetype.id);
      const paragraph = html.match(DESCRIPTION_PARAGRAPH)?.[1] ?? "";
      expect(paragraph, `${archetype.id}: description paragraph`).not.toBe("");

      const marked = [
        ...paragraph.matchAll(/<span class="results-emphasis">([^<]*)<\/span>/g),
      ].map(([, text]) => text);

      expect(marked.slice().sort(), `${archetype.id}: marked words`).toEqual(
        [...archetype.emphasisWords].sort(),
      );
    }
  });

  it("changes presentation only: stripping the bands gives the stored copy back", () => {
    for (const archetype of ARCHETYPES) {
      const { paragraph } = renderDescription(archetype.id);

      expect(
        paragraph.replace(/<span class="results-emphasis">/g, "").replace(/<\/span>/g, ""),
      ).toBe(archetype.description);
    }
  });

  it("gives every archetype its own colour through --accent, never gold", () => {
    const rule = block(".results-emphasis");

    // The briefed band, exactly: 55% → 92%, in the accent at 38%.
    expect(rule).toContain("background: linear-gradient(");
    expect(rule).toContain("transparent 55%");
    expect(rule).toContain("color-mix(in srgb, var(--accent) 38%, transparent) 55%");
    expect(rule).toContain("color-mix(in srgb, var(--accent) 38%, transparent) 92%");
    expect(rule).toContain("transparent 92%");
    expect(rule).toContain("font-weight: 700");

    // No hardcoded colour, and not the quiz's gold band device.
    expect(rule).not.toContain("--marker-gold");
    expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // The glyph colour stays inherited from the body paragraph.
    expect(rule).not.toMatch(/(^|[^-])color:\s/);
  });

  it("points --accent at the archetype's own accent on the results root", () => {
    // `--accent` is re-pointed per archetype, which is what makes one rule paint
    // eight different colours. Without this the band would fall back to the
    // site's terracotta for every archetype.
    expect(VIEW_SOURCE).toContain('"--accent": archetype.accentColor');
    expect(VIEW_SOURCE).toContain("splitEmphasis(archetype.description, archetype.emphasisWords)");
  });
});
