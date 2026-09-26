import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TraitBars, {
  TRAIT_ANIMATION_DURATION_MS,
  TRAIT_ANIMATION_STAGGER_MS,
} from "@/components/results/TraitBars";
import QuizResultCard from "@/components/quiz/QuizResultCard";
import ResultsView from "@/components/results/ResultsView";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";
import { getArchetypeById } from "@/lib/personality/archetypes";
import { makeMatchResult, makeVector } from "@/tests/ai/fixtures";
import type { ResultsViewData } from "@/lib/results/service";

/**
 * Server-side render smoke tests for the shared animated trait bars.
 *
 * Same convention as the other UI tests: react-dom/server, no jsdom, no
 * browser, no timing-dependent assertions. We verify structure, that BOTH
 * results screens render the shared implementation, and the exported timing
 * contract — not exact frame values.
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

const archetype = getArchetypeById("mysterious-explorer")!;
const vector = makeVector(50);

const viewData = (): ResultsViewData => ({
  recommendations: makeMatchResult().recommendations,
  explanations: new Map(),
  aiAvailable: false,
  isEmpty: false,
});

describe("shared trait bars — timing contract", () => {
  it("uses a deliberately slow duration within the 1800–2200ms target", () => {
    expect(TRAIT_ANIMATION_DURATION_MS).toBe(2000);
    expect(TRAIT_ANIMATION_DURATION_MS).toBeGreaterThanOrEqual(1800);
    expect(TRAIT_ANIMATION_DURATION_MS).toBeLessThanOrEqual(2200);
  });

  it("keeps a positive stagger smaller than the duration", () => {
    expect(TRAIT_ANIMATION_STAGGER_MS).toBeGreaterThan(0);
    expect(TRAIT_ANIMATION_STAGGER_MS).toBeLessThan(TRAIT_ANIMATION_DURATION_MS);
  });
});

describe("shared trait bars — rendered by BOTH results screens", () => {
  it("screen 1 (QuizResultCard) renders the shared animated implementation", () => {
    const result = scoreQuiz(
      QUIZ_QUESTIONS.map((question) => ({
        questionId: question.id,
        optionId: question.options[0].id,
      })),
    );

    const html = render(<QuizResultCard result={result} onRestart={() => undefined} />);

    // The shared component's structural signature must be present.
    expect(html).toContain("پروفایل شخصیتی تو");
    expect(html).toContain("duration:2000ms");
    expect(html).toContain("cubic-bezier(0.22, 1, 0.36, 1)");
    // Staggered transition delays must appear (index * 120ms).
    expect(html).toContain("delay:120ms");
    expect(html).toContain("delay:960ms");
    // Reduced-motion bypass hook lives on the fill itself.
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("screen 2 (ResultsView) renders the same shared implementation", () => {
    const html = render(<ResultsView vector={vector} archetype={archetype} data={viewData()} />);

    expect(html).toContain("پروفایل شخصیتی تو");
    expect(html).toContain("duration:2000ms");
    expect(html).toContain("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(html).toContain("delay:120ms");
    expect(html).toContain("delay:960ms");
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("TraitBars alone renders a progressbar role for all nine dimensions", () => {
    const html = render(<TraitBars vector={vector} />);

    expect((html.match(/role="progressbar"/g) ?? []).length).toBe(9);
    expect(html).toContain('aria-valuenow="50"');
  });

  it("renders accessible final values immediately in the server markup", () => {
    // SSR renders the pre-animation state: width 0, aria-valuenow = target.
    // The accessible value must already be the real one before any JS runs.
    const html = render(<TraitBars vector={vector} />);

    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('width:0%');
  });
});
