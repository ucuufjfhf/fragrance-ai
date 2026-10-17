import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AnswerDecode from "@/components/results/AnswerDecode";
import ResultsView from "@/components/results/ResultsView";
import StagedReveal, {
  STAGED_REVEAL_BEAT_MS,
} from "@/components/results/StagedReveal";
import { decodeAnswers } from "@/lib/personality/answer-decode";
import {
  QUESTION_HIGHLIGHTS,
  splitHighlighted,
} from "@/lib/personality/question-highlights";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";
import { makeMatchResult, makeVector } from "@/tests/ai/fixtures";
import { getArchetypeById } from "@/lib/personality/archetypes";
import type { MatchedPerfume } from "@/types/recommendation";
import type { ResultsViewData } from "@/lib/results/service";

/**
 * Phase 3 results experience — static-markup and contract tests.
 *
 * Same convention as the other UI suites (react-dom/server, no jsdom): the
 * timer choreography (one beat per card, tap-to-skip) is proven in the
 * browser gate on the production build. Here the structure is locked: all
 * three cards present in rank order, the single travel-note wipe, and a
 * decode grounded in the shopper's real answers.
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

const archetype = getArchetypeById("mysterious-explorer")!;
const vector = makeVector(50);

const threeRecommendations = (): MatchedPerfume[] => {
  const [first, second] = makeMatchResult().recommendations;
  const third: MatchedPerfume = {
    ...second,
    perfumeId: "perfume-test-amber",
    name: "کهربا آزمون",
    rank: 3,
  };
  return [
    { ...first, rank: 1 },
    { ...second, rank: 2 },
    third,
  ];
};

const viewData = (overrides: Partial<ResultsViewData> = {}): ResultsViewData => ({
  recommendations: threeRecommendations(),
  explanations: new Map(),
  aiAvailable: false,
  isEmpty: false,
  ...overrides,
});

const realSheet = () =>
  QUIZ_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: question.options[0].id,
  }));

describe("staged reveal structure", () => {
  it("renders every card in rank order (final-first, no-JS safe)", () => {
    const html = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData()}
      />,
    );

    const first = html.indexOf("نویر آزمون");
    const second = html.indexOf("تازه آزمون");
    const third = html.indexOf("کهربا آزمون");

    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it("stages one beat per card inside the 600–800ms band", () => {
    expect(STAGED_REVEAL_BEAT_MS).toBeGreaterThanOrEqual(600);
    expect(STAGED_REVEAL_BEAT_MS).toBeLessThanOrEqual(800);
  });

  it("marks the three stops of the journey in order", () => {
    const html = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData()}
      />,
    );

    const first = html.indexOf("ایستگاه اول");
    const second = html.indexOf("ایستگاه دوم");
    const third = html.indexOf("ایستگاه سوم");

    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it("renders statically under reduced motion", () => {
    const items = threeRecommendations().map((recommendation) => (
      <li key={recommendation.perfumeId}>{recommendation.name}</li>
    ));
    const html = render(
      <StagedReveal reducedMotionOverride>{items}</StagedReveal>,
    );

    for (const recommendation of threeRecommendations()) {
      expect(html).toContain(recommendation.name);
    }
  });
});

describe("travel-note headline", () => {
  it("renders with the single marker-wipe on the emotional core", () => {
    const html = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData()}
      />,
    );

    // The wipe splits the headline around its core, so the parts — not one
    // contiguous string — are asserted, then reassembled like the copy is.
    expect(html).toContain("یادداشت ");
    expect(html).toContain(" شما");
    expect(html).toContain("سه ایستگاه در سفر عطری شما");

    // Exactly one wipe on this page: the travel-note headline owns it.
    const wipeIndex = html.indexOf("marker-wipe");
    expect(wipeIndex).toBeGreaterThan(-1);
    const heading = html.slice(wipeIndex - 200, wipeIndex + 400);
    expect(heading).toContain("سفر عطری");
    expect(heading).toContain("یادداشت ");
  });

  it("keeps the highlight byte-exact inside its headline", () => {
    const phrase = QUESTION_HIGHLIGHTS["travel-note"];
    const headline = "یادداشت سفر عطری شما";

    expect(headline).toContain(phrase);
    const parts = splitHighlighted(headline, phrase)!;
    expect(parts[0] + parts[1] + parts[2]).toBe(headline);
  });

  it("keeps every pre-existing results block in place", () => {
    const html = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData()}
      />,
    );

    // Kicker keeps the old heading copy; centroid explainer byte-identical.
    expect(html).toContain("عطرهایی که بهتون میاد");
    expect(html).toContain("شخصیتت");
    expect(html).toContain("پروفایل عطری شما");
  });
});

describe("answer decode section", () => {
  it("renders the shopper's real answers mapped to their traits", () => {
    const answers = realSheet();
    const scored = scoreQuiz(answers);
    const html = render(
      <ResultsView
        vector={scored.vector}
        archetype={scored.archetype}
        data={viewData()}
        answers={answers}
      />,
    );

    expect(html).toContain("چطور به اینجا رسیدید؟");

    const decoded = decodeAnswers(answers, scored.vector);
    expect(decoded.length).toBeGreaterThan(0);
    for (const item of decoded) {
      expect(html).toContain(item.optionLabel);
      expect(html).toContain(item.traitLabel);
    }
  });

  it("hides itself on legacy links with no answer sheet", () => {
    const html = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData()}
      />,
    );

    expect(html).not.toContain("چطور به اینجا رسیدید؟");
  });

  it("renders nothing for an empty decode", () => {
    expect(render(<AnswerDecode items={[]} />)).toBe("");
  });
});
