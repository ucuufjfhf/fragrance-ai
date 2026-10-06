import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RecommendationCard from "@/components/results/RecommendationCard";
import ResultsView from "@/components/results/ResultsView";
import { makeMatchResult, makeVector } from "@/tests/ai/fixtures";
import type { ResultsViewData } from "@/lib/results/service";
import { getArchetypeById } from "@/lib/personality/archetypes";

/**
 * Server-side render smoke tests for the Phase 5 results UI (same convention
 * as the Phase 1 quiz UI tests: react-dom/server, no jsdom, no browser).
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}


const archetype = getArchetypeById("mysterious-explorer")!;
const vector = makeVector(50);

const engineResult = makeMatchResult();

const viewData = (overrides: Partial<ResultsViewData> = {}): ResultsViewData => ({
  recommendations: engineResult.recommendations,
  explanations: new Map(),
  aiAvailable: true,
  isEmpty: false,
  ...overrides,
});

describe("results view rendering", () => {
  it("renders recommendations in the exact deterministic engine order", () => {
    const html = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData()}
      />,
    );

    // The engine ranks noir (small offset) above fresh (larger offset);
    // document order must match rank order.
    const noirIndex = html.indexOf("نویر آزمون");
    const freshIndex = html.indexOf("تازه آزمون");

    expect(noirIndex).toBeGreaterThan(-1);
    expect(freshIndex).toBeGreaterThan(noirIndex);
  });

  it("displays the engine's presentation score, not a recomputed one", () => {
    const recommendation = engineResult.recommendations[0];
    const html = render(<RecommendationCard recommendation={recommendation} />);

    expect(html).toContain(String(recommendation.presentationScore));
    expect(html).toContain("تطابق");
    expect(html).toContain(`aria-valuenow="${Math.round(recommendation.presentationScore)}"`);
  });

  it("shows the AI explanation when one exists for the perfume", () => {
    const recommendation = engineResult.recommendations[0];
    const explanation = "این عطر با سلیقه گرم و مرموز تو هماهنگه.";
    const html = render(
      <RecommendationCard
        recommendation={recommendation}
        explanation={explanation}
      />,
    );

    expect(html).toContain("چرا بهت میاد؟");
    expect(html).toContain(explanation);
  });

  it("keeps every recommendation when the AI is unavailable (no explanations)", () => {
    const html = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData({ aiAvailable: false, explanations: new Map() })}
      />,
    );

    for (const recommendation of engineResult.recommendations) {
      expect(html).toContain(recommendation.name);
    }
    expect(html).toContain("توضیحات هوشمند فعلاً در دسترس نیست.");
    expect(html).not.toContain("چرا بهت میاد؟");
  });

  it("renders the empty state without fabricating recommendations", () => {
    const html = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData({
          recommendations: [],
          explanations: new Map(),
          aiAvailable: false,
          isEmpty: true,
        })}
      />,
    );

    expect(html).toContain("فعلاً عطری مطابق با پروفایل تو پیدا نکردیم.");
    expect(html).not.toContain("نویر آزمون");
    expect(html).toContain("/quiz");
  });

  it("shows the profile header and restart links", () => {
    const html = render(
      <ResultsView vector={vector} archetype={archetype} data={viewData()} />,
    );

    expect(html).toContain("پروفایل عطری شما");
    expect(html).toContain(archetype.label);
    expect(html).toContain("عطرهایی که بهت میاد");
    expect(html).toContain("شروع دوباره");
    expect(html).toContain("نه یک تست روانشناسی".replace(/\\u200c/g, ""));
  });

  it("omits the product link gracefully when the engine returns none", () => {
    const noUrl = {
      ...engineResult.recommendations[0],
      productUrl: null,
      imageUrl: null,
    };
    const html = render(<RecommendationCard recommendation={noUrl} />);

    expect(html).not.toContain("مشاهده عطر");
    expect(html).not.toContain("<img");
  });
});

describe("context-filtered empty state", () => {
  it("shows the graceful no-match message and a relax action when the context filtered everything out", () => {
    const html = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData({ isEmpty: true, recommendations: [], aiAvailable: false })}
        contextRelaxHref="/result?v_fresh=50&archetype=mysterious-explorer"
      />,
    );

    // The filters are never bypassed silently: the message explains that no
    // perfume matches ALL selected preferences…
    expect(html).toContain("ترجیحات انتخابی");
    // …and offers a clear action that relaxes exactly the context tokens
    // (React escapes `&` as `&amp;` inside the rendered attribute).
    expect(html).toContain("حذف فیلتر فصل و موقعیت");
    expect(html).toContain(
      'href="/result?v_fresh=50&amp;archetype=mysterious-explorer"',
    );
    // The restart action stays available alongside it.
    expect(html).toContain("شروع دوباره آزمون");
  });

  it("keeps the legacy empty state when no context was active", () => {
    const html = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData({ isEmpty: true, recommendations: [], aiAvailable: false })}
      />,
    );

    expect(html).toContain("فعلاً عطری مطابق با پروفایل تو پیدا نکردیم");
    expect(html).not.toContain("حذف فیلتر فصل و موقعیت");
  });

  it("does not show the context message when recommendations exist", () => {
    const html = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData()}
        contextRelaxHref="/result?season=summer"
      />,
    );

    expect(html).not.toContain("حذف فیلتر فصل و موقعیت");
    expect(html).toContain("عطرهایی که بهت میاد");
  });
});
