import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ResultsView from "@/components/results/ResultsView";
import { archetypeEmblemImageFor } from "@/components/archetype-emblems";
import { ARCHETYPES } from "@/lib/personality/archetypes";
import type { ResultsViewData } from "@/lib/results/service";
import { makeMatchResult, makeVector } from "@/tests/ai/fixtures";

/**
 * The results header medallion: the archetype's illustrated emblem, gold-ringed.
 *
 * Batch 27 replaced the line icon (`ArchetypeEmblem` + the `archetype-icon-pop`
 * choreography) with the same bundled artwork every other surface already shows.
 * These pins hold that swap in place from the outside (rendered markup) and from
 * the inside (no line-icon component or pop CSS left in this file), while
 * proving the shared pop CSS is still intact for the reveal stage.
 */

const VIEW_SOURCE = readFileSync(
  new URL("../../components/results/ResultsView.tsx", import.meta.url),
  "utf8",
);
const REVEAL_SOURCE = readFileSync(
  new URL("../../components/quiz/ArchetypeRevealStage.tsx", import.meta.url),
  "utf8",
);

const render = (element: ReactElement): string =>
  renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");

const viewData = (): ResultsViewData => ({
  recommendations: makeMatchResult().recommendations,
  explanations: new Map(),
  aiAvailable: true,
  isEmpty: false,
});

const renderHeader = (archetypeId: string): { html: string; seal: string } => {
  const archetype = ARCHETYPES.find((candidate) => candidate.id === archetypeId)!;
  const html = render(
    <ResultsView vector={makeVector(50)} archetype={archetype} data={viewData()} />,
  );

  // The seal is the only role="img" in the header: take its opening tag.
  const at = html.indexOf('role="img"');
  expect(at, `${archetypeId}: seal missing`).toBeGreaterThan(-1);
  const seal = html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);

  return { html, seal };
};

describe("archetype medallion", () => {
  it("shows the archetype's bundled emblem, not a line icon, for every archetype", () => {
    for (const archetype of ARCHETYPES) {
      const { html } = renderHeader(archetype.id);
      const expected = archetypeEmblemImageFor(archetype.id);

      expect(html, `${archetype.id}: emblem image`).toContain(
        `<img src="${expected}" alt="" width="1600" height="1600" class="h-full w-full object-cover"/>`,
      );
      // The line-icon renders and its pop choreography are gone from the header.
      expect(html).not.toContain("archetype-icon-pop");
      expect(html).not.toContain("archetype-icon");
    }
  });

  it("keeps the seal's accessible name and the 120ms cascade slot", () => {
    for (const archetype of ARCHETYPES) {
      const { seal } = renderHeader(archetype.id);

      expect(seal).toContain('role="img"');
      expect(seal).toContain(`aria-label="${archetype.label}"`);
      // Same reveal slot as before: the medallion still rises with the header.
      expect(seal).toContain("quiz-rise");
      expect(seal).toContain("animation-delay:120ms");
      // The artwork itself is decorative — the seal carries the name.
      expect(seal).not.toContain("alt=\"");
    }
  });

  it("rings the medallion in gold, with a faint gold halo outside it", () => {
    const { seal } = renderHeader("mysterious-explorer");

    // ~120px at the design's breakpoints, circular, with a 3px gold ring.
    expect(seal).toContain("h-28 w-28");
    expect(seal).toContain("sm:h-32 sm:w-32");
    expect(seal).toContain("rounded-full");
    expect(seal).toContain("border-[3px]");
    expect(seal).toContain("border-color:var(--marker-gold)");
    // Soft shadow, not the flat card shadow the 64px seal used.
    expect(seal).toContain("shadow-[var(--shadow-soft)]");
  });

  it("leaves the shared pop CSS in place for the reveal stage", () => {
    // Only ResultsView stopped using it; the reveal stage still imports it, so
    // the stylesheet in components/archetype-icons.tsx must stay untouched.
    expect(VIEW_SOURCE).not.toContain("ARCHETYPE_ICON_POP_CSS");
    expect(VIEW_SOURCE).not.toContain("ArchetypeEmblem");
    expect(VIEW_SOURCE).not.toContain("archetype-icon-map");
    expect(VIEW_SOURCE).toContain("archetypeEmblemImageFor");
    expect(REVEAL_SOURCE).toContain("ARCHETYPE_ICON_POP_CSS");
  });
});
