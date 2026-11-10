import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SampleResultSection from "@/components/landing/SampleResultSection";
import FragranceProfileCard from "@/components/quiz/FragranceProfileCard";
import { WidgetResult } from "@/components/widget/WidgetApp";
import { ARCHETYPES, getArchetypeById } from "@/lib/personality/archetypes";
import type { WidgetRecommendationResponse } from "@/lib/widget/contract";
import { makeVector } from "@/tests/ai/fixtures";
import type { QuizResult } from "@/types/personality";

/**
 * Batch 35 — every surface that presents an archetype now speaks the language
 * batch 27 introduced on the /result header: the gold-ring medallion (3px
 * var(--marker-gold) ring + 25%-alpha halo) and the description's trait words
 * banded by `.results-emphasis`.
 *
 * The copy is the contract: `splitEmphasis` may only wrap stored words, so each
 * pin checks both directions — the exact emphasisWords are banded, and stripping
 * the bands gives the stored description back byte-for-byte.
 */

const render = (element: ReactElement): string =>
  renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");

const HALO_CLASS = "pointer-events-none absolute -inset-2 rounded-full border";
const HALO_COLOUR = "color-mix(in srgb, var(--marker-gold) 25%, transparent)";

const EMPHASIS = /<span class="results-emphasis">([^<]*)<\/span>/g;

/** The banded runs, in document order. */
const emphasised = (html: string): string[] =>
  [...html.matchAll(EMPHASIS)].map(([, text]) => text);

/** Inner markup of the paragraph identified by `paragraphClass`. */
function descriptionInner(html: string, paragraphClass: string): string {
  const at = html.indexOf(paragraphClass);
  expect(at, `no description paragraph: ${paragraphClass}`).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<p", at);
  const open = html.indexOf(">", start);
  return html.slice(open + 1, html.indexOf("</p>", open));
}

/** The paragraph with the emphasis wrappers removed — must equal the copy. */
const plain = (inner: string): string =>
  inner.replace(/<span class="results-emphasis">/g, "").replace(/<\/span>/g, "");

const quizResult = (archetypeId: string): QuizResult =>
  ({
    answers: [],
    raw: makeVector(50),
    vector: makeVector(50),
    archetype: getArchetypeById(archetypeId)!,
  }) as unknown as QuizResult;

const SAMPLE_PARAGRAPH = "max-w-md text-sm leading-8 text-foreground/80";
const PROFILE_PARAGRAPH = "quiz-rise max-w-md text-sm leading-8 text-foreground/80";

describe("landing sample — medallion + emphasis", () => {
  const archetype = getArchetypeById("bold-one")!;
  const html = render(<SampleResultSection />);

  it("wears the gold-ring medallion at the /result header's size", () => {
    expect(html).toContain("border-[3px]");
    expect(html).toContain("h-28 w-28");
    expect(html).toContain("sm:h-32 sm:w-32");
    expect(html).toContain("border-color:var(--marker-gold)");
    expect(html).toContain(HALO_CLASS);
    expect(html).toContain(HALO_COLOUR);

    // The pre-27 seal (96px, thin accent border, inner accent ring) is gone.
    expect(html).not.toContain("h-24 w-24");
    expect(html).not.toContain("-m-2.5");
  });

  it("bands exactly the sample archetype's trait words, text unchanged", () => {
    const inner = descriptionInner(html, SAMPLE_PARAGRAPH);

    expect(emphasised(inner).sort()).toEqual([...archetype.emphasisWords].sort());
    expect(plain(inner)).toBe(archetype.description);
  });

  it("still reads as a sample, never as someone's result", () => {
    expect(html).toContain("نمونه نتیجه");
    expect(html).toContain("نتیجه‌تون چیزی شبیه این میشه");
    expect(html).toContain("این یک نمونه‌ست، نه نتیجه واقعی شما");
    // The fixed archetype choice is unchanged (شعله).
    expect(html).toContain(archetype.label);
  });
});

describe("quiz profile card — emphasis on every archetype", () => {
  it("bands the declared words and only those, for all archetypes", () => {
    for (const archetype of ARCHETYPES) {
      const html = render(
        <FragranceProfileCard result={quizResult(archetype.id)} onRestart={() => {}} />,
      );
      const inner = descriptionInner(html, PROFILE_PARAGRAPH);

      expect(emphasised(inner).sort(), `${archetype.id}: banded words`).toEqual(
        [...archetype.emphasisWords].sort(),
      );
      expect(plain(inner), `${archetype.id}: copy`).toBe(archetype.description);
    }
  });

  it("keeps its compact emblem thumb exactly as it was", () => {
    const html = render(
      <FragranceProfileCard result={quizResult("bold-one")} onRestart={() => {}} />,
    );

    // The thumb stays the pre-27 seal: 96px, thin accent border, no gold ring.
    expect(html).toContain("h-24 w-24");
    expect(html).toContain("border border-accent/30");
    expect(html).not.toContain("border-[3px]");
    expect(html).not.toContain(HALO_CLASS);
  });
});

describe("widget result header — medallion + emphasis", () => {
  const archetype = getArchetypeById("bold-one")!;
  const data = { recommendations: [] } as unknown as WidgetRecommendationResponse;
  const html = render(
    <WidgetResult
      storeId="store-A"
      storeSlug="w-shop"
      storeWebsiteUrl={null}
      result={quizResult("bold-one")}
      data={data}
      onRestart={() => {}}
    />,
  );

  it("uses the same medallion, held at the widget's scale", () => {
    expect(html).toContain("h-24 w-24");
    expect(html).toContain("border-[3px]");
    expect(html).toContain("border-color:var(--marker-gold)");
    expect(html).toContain(HALO_CLASS);
    expect(html).toContain(HALO_COLOUR);

    // The old thin outer ring on the seal is gone (the section keeps its own
    // accent border — that is chrome, not the seal).
    expect(html).not.toContain("border-accent/20");
  });

  it("bands the words in the ARCHETYPE's accent, not the store's", () => {
    const inner = descriptionInner(html, SAMPLE_PARAGRAPH);

    expect(emphasised(inner).sort()).toEqual([...archetype.emphasisWords].sort());
    expect(plain(inner)).toBe(archetype.description);

    // The result wrapper re-points --accent to the archetype colour, shadowing
    // the store accent WidgetShell sets around it; the shared rule reads that.
    expect(html).toContain(`--accent:${archetype.accentColor}`);
  });
});
