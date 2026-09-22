import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Quiz from "@/components/quiz/Quiz";
import QuizResultCard from "@/components/quiz/QuizResultCard";
import {
  DEFAULT_RESULTS_STORE_ID,
  parseResultsParams,
  serializeResultsParams,
} from "@/lib/results/params";
import { scoreQuiz } from "@/lib/personality/scoring";
import type { QuizResult } from "@/types/personality";

/**
 * Phase 9 — standalone quiz store attribution.
 *
 * The recorded Phase 9 scope: the standalone (non-widget) quiz must be able to
 * carry a store context so analytics events and the results URL are attributed
 * to the merchant's store, matching the Phase 8 widget behaviour. Pure + SSR
 * tests, no live DB (project convention).
 */

function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

/** A deterministic completed quiz result for the result-card tests. */
function makeResult(): QuizResult {
  // Answer every question with its first option through the REAL scorer —
  // never a hand-built vector (one canonical scoring engine, §6 Phase 8).
  const answers = QuizAnswersFixture();
  return scoreQuiz(answers);
}

// Imported lazily to keep the helper above readable.
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";

function QuizAnswersFixture() {
  return QUIZ_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: question.options[0].id,
  }));
}

describe("serializeResultsParams — store pinning (Phase 9)", () => {
  it("omits the store param when no store context exists (default behaviour)", () => {
    const result = makeResult();
    const query = serializeResultsParams(result.vector, result.archetype.id);

    expect(query).not.toContain("store=");
  });

  it("pins the store into the URL when the quiz carries one", () => {
    const result = makeResult();
    const query = serializeResultsParams(result.vector, result.archetype.id, "store-merchant-x");

    expect(query).toContain("store=store-merchant-x");
  });

  it("round-trips the pinned store through the parser", () => {
    const result = makeResult();
    const query = serializeResultsParams(result.vector, result.archetype.id, "store-merchant-x");
    const params = Object.fromEntries(new URLSearchParams(query));

    const parsed = parseResultsParams(params);

    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      expect(parsed.value.storeId).toBe("store-merchant-x");
    }
  });

  it("falls back to the default store when the quiz carries none", () => {
    const result = makeResult();
    const query = serializeResultsParams(result.vector, result.archetype.id);
    const params = Object.fromEntries(new URLSearchParams(query));

    const parsed = parseResultsParams(params);

    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      expect(parsed.value.storeId).toBe(DEFAULT_RESULTS_STORE_ID);
    }
  });
});

describe("Quiz component — store context flows through (Phase 9)", () => {
  it("renders identically with and without a store id (no store selector in the UI, §10)", () => {
    const withoutStore = render(<Quiz />);
    const withStore = render(<Quiz storeId="store-merchant-x" />);

    // The customer never picks a store: no select/option elements may appear.
    expect(withoutStore).not.toContain("<select");
    expect(withStore).not.toContain("<select");
    expect(withStore).not.toContain("<option");

    // The intro copy is unchanged by the store context.
    expect(withStore).toContain("عطر مناسب خودت رو پیدا کن");
  });

  it("SSRs the intro for a store-pinned page without errors", () => {
    const html = render(<Quiz storeId="store-demo-perfume-shop" />);

    expect(html).toContain("شروع آزمون");
  });
});

describe("QuizResultCard — results URL carries the pinned store (Phase 9)", () => {
  it("links to /result with the store param when a store context exists", () => {
    const result = makeResult();
    const html = render(
      <QuizResultCard
        result={result}
        onRestart={() => undefined}
        storeId="store-merchant-x"
      />,
    );

    expect(html).toContain("store=store-merchant-x");
  });

  it("links to /result without a store param when the quiz had none", () => {
    const result = makeResult();
    const html = render(<QuizResultCard result={result} onRestart={() => undefined} />);

    expect(html).not.toContain("store=");
  });
});
