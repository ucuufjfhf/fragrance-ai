import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AnalysisInterstitial, {
  ANALYSIS_ARTWORK_SHIFT_TICKS,
  ANALYSIS_DURATION_MS,
  ANALYSIS_PROGRESS_STEPS,
  ANALYSIS_TICK_MS,
  INTERSTITIAL_LINE_INTERVAL_MS,
  INTERSTITIAL_LINES,
  MAX_INTERSTITIAL_ECHOES,
  analysisLineSequence,
} from "@/components/quiz/AnalysisInterstitial";
import {
  ANALYSIS_ECHO_CONSEQUENCES,
  ECHO_QUESTION_IDS,
  buildAnalysisEchoes,
  quoteFromOptionLabel,
} from "@/lib/personality/analysis-echoes";
import { QUIZ_QUESTIONS, getQuestionById } from "@/lib/personality/questions";
import type { QuizAnswer } from "@/types/personality";

/**
 * Batch 30 — the interstitial echoes the shopper's own answers.
 *
 * Two quotes only (`scent-role`, `usage`), each a verbatim substring of the
 * stored label, interleaved with the generic lines at the existing interval.
 * The pacing is a hard contract: the echoes change WHICH lines rotate, never
 * how long anything takes — pinned here and in `phase2-beats`.
 */

const noop = (): void => undefined;

const render = (element: React.ReactElement): string =>
  renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");

const answer = (questionId: string, optionId: string): QuizAnswer => ({
  questionId,
  optionId,
});

const optionOf = (questionId: string, optionId: string) =>
  getQuestionById(questionId)!.options.find((option) => option.id === optionId)!;

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

describe("analysis echoes — only the two identity answers", () => {
  it("quotes nothing from the other eight questions", () => {
    const others = QUIZ_QUESTIONS.filter(
      (question) => !ECHO_QUESTION_IDS.includes(question.id as never),
    );
    expect(others).toHaveLength(8);

    const answers = others.map((question) =>
      answer(question.id, question.options[0].id),
    );
    expect(buildAnalysisEchoes(answers)).toEqual([]);
    // An empty sheet is empty, never a generic fallback line.
    expect(buildAnalysisEchoes([])).toEqual([]);
  });

  it("returns at most two, one per echo question, in bank order", () => {
    // Deliberately out of order: the bank decides the order, not the sheet.
    const echoes = buildAnalysisEchoes([
      answer("usage", "everyday"),
      answer("scent-role", "mood"),
    ]);

    expect(echoes.map((echo) => echo.questionId)).toEqual([
      "scent-role",
      "usage",
    ]);
    expect(echoes).toHaveLength(2);
    expect(echoes.length).toBeLessThanOrEqual(2);
  });

  it("drops an unanswered or unknown option instead of inventing a quote", () => {
    expect(
      buildAnalysisEchoes([answer("scent-role", "not-an-option")]).map(
        (echo) => echo.questionId,
      ),
    ).toEqual(["usage"].slice(0, 0));

    // Only the answered one survives.
    const echoes = buildAnalysisEchoes([answer("usage", "evening")]);
    expect(echoes).toHaveLength(1);
    expect(echoes[0].questionId).toBe("usage");
  });
});

describe("analysis echoes — the quote is the shopper's own label", () => {
  it("is a verbatim substring of every stored label, ZWNJ included", () => {
    for (const questionId of ECHO_QUESTION_IDS) {
      const question = getQuestionById(questionId)!;

      for (const option of question.options) {
        const echoes = buildAnalysisEchoes([answer(questionId, option.id)]);
        expect(echoes, `${questionId}/${option.id} produced no echo`).toHaveLength(1);

        const [echo] = echoes;
        expect(echo.quote.length).toBeGreaterThan(0);
        expect(
          option.label.includes(echo.quote),
          `${echo.quote} is not in ${option.label}`,
        ).toBe(true);
        // The full label travels with it: nothing is retyped anywhere.
        expect(echo.optionLabel).toBe(option.label);
      }
    }
  });

  it("takes the first clause where the copy has a «؛»", () => {
    const signature = optionOf("scent-role", "signature");
    expect(signature.label).toContain("؛");

    const [echo] = buildAnalysisEchoes([answer("scent-role", "signature")]);
    expect(echo.quote).toBe("امضای شخصیمه");
    expect(signature.label.startsWith(echo.quote)).toBe(true);

    // Trailing full stops are trimmed, and the quote stays a substring.
    expect(quoteFromOptionLabel("حس تمیزی و سرحالی بهم می‌ده.")).toBe(
      "حس تمیزی و سرحالی بهم می‌ده",
    );
  });
});

describe("analysis echoes — the line and its copy", () => {
  it("renders «گفتید: «…» — …» with a short, warm, emoji-free consequence", () => {
    // The approved sample line, verbatim.
    const [signature] = buildAnalysisEchoes([
      answer("scent-role", "signature"),
    ]);
    expect(signature.line).toBe(
      "گفتید: «امضای شخصیمه» — دنبال رایحه‌های موندگارتر می‌گردیم…",
    );

    for (const questionId of ECHO_QUESTION_IDS) {
      for (const option of getQuestionById(questionId)!.options) {
        const [echo] = buildAnalysisEchoes([answer(questionId, option.id)]);

        expect(echo.consequence).toBe(ANALYSIS_ECHO_CONSEQUENCES[`${questionId}:${option.id}`]);
        expect(echo.line).toBe(
          `گفتید: «${echo.quote}» — ${echo.consequence}…`,
        );
        expect(echo.line).not.toMatch(EMOJI);

        // Short enough to read inside one 1200ms beat.
        const words = echo.consequence.split(/\s+/u).filter(Boolean);
        expect(words.length, `${echo.consequence} is too long`).toBeLessThanOrEqual(8);
      }
    }

    // Every option of both questions has copy — six lines, no gaps.
    expect(Object.keys(ANALYSIS_ECHO_CONSEQUENCES)).toHaveLength(6);
  });
});

describe("analysis echoes — the rotation", () => {
  it("interleaves generic and echo lines in the approved order", () => {
    const [first, second, third] = INTERSTITIAL_LINES;

    // With no echoes it IS today's rotation, byte for byte.
    expect(analysisLineSequence()).toEqual([first, second, third]);
    expect(analysisLineSequence([])).toEqual([first, second, third]);

    // generic-1, echo-1, generic-2, echo-2, generic-3.
    expect(analysisLineSequence(["E1", "E2"])).toEqual([
      first,
      "E1",
      second,
      "E2",
      third,
    ]);
    // One missing answer just drops its slot.
    expect(analysisLineSequence(["E1"])).toEqual([first, "E1", second, third]);

    // Extra echoes can never add beats beyond the two generic gaps.
    expect(MAX_INTERSTITIAL_ECHOES).toBe(2);
    expect(analysisLineSequence(["E1", "E2", "E3"])).toEqual([
      first,
      "E1",
      second,
      "E2",
      third,
    ]);
  });
});

describe("analysis echoes — pacing stays exactly as it was", () => {
  it("keeps every timing constant untouched", () => {
    expect(INTERSTITIAL_LINE_INTERVAL_MS).toBe(1200);
    expect(ANALYSIS_DURATION_MS).toBe(6500);
    expect(ANALYSIS_TICK_MS).toBe(100);
    expect(ANALYSIS_PROGRESS_STEPS).toBe(65);
    expect(ANALYSIS_ARTWORK_SHIFT_TICKS).toBe(14);

    // The longest sequence still fits inside the performance: five lines need
    // four intervals, well under the 6.5s beat.
    const longest = analysisLineSequence(["E1", "E2"]);
    expect(longest).toHaveLength(5);
    expect((longest.length - 1) * INTERSTITIAL_LINE_INTERVAL_MS).toBeLessThan(
      ANALYSIS_DURATION_MS,
    );
    // …and the beat is still exactly 65 ticks of 100ms.
    expect(ANALYSIS_TICK_MS * ANALYSIS_PROGRESS_STEPS).toBe(ANALYSIS_DURATION_MS);
  });

  it("opens on the first generic line, echoes or not", () => {
    const html = render(
      <AnalysisInterstitial
        matches={[]}
        onDone={noop}
        onSkip={noop}
        echoLines={["E1", "E2"]}
      />,
    );

    // Tick 0 is the first line: the echoes never take the opening slot.
    expect(html).toContain(INTERSTITIAL_LINES[0]);
    expect(html).not.toContain("E1");
    expect(html).toContain("۰٪");
    expect(html).toContain("رد شدن");
  });

  it("freezes reduced motion on ۳۴٪ and the first generic line", () => {
    const html = render(
      <AnalysisInterstitial
        matches={[]}
        onDone={noop}
        onSkip={noop}
        reducedMotionOverride
        echoLines={["E1", "E2"]}
      />,
    );

    expect(html).toContain("۳۴٪");
    expect(html).toContain(INTERSTITIAL_LINES[0]);
    expect(html).not.toContain("E1");
  });
});

describe("analysis echoes — wiring and scope", () => {
  const QUIZ_SOURCE = readFileSync(
    new URL("../../components/quiz/Quiz.tsx", import.meta.url),
    "utf8",
  );
  const WIDGET_SOURCE = readFileSync(
    new URL("../../components/widget/WidgetAnalysis.tsx", import.meta.url),
    "utf8",
  );

  it("the quiz owns the answers and passes the echoes", () => {
    expect(QUIZ_SOURCE).toContain(
      'import { buildAnalysisEchoes } from "@/lib/personality/analysis-echoes"',
    );
    expect(QUIZ_SOURCE).toContain("buildAnalysisEchoes(toAnswers(flow))");
    expect(QUIZ_SOURCE).toContain("echoLines={analysisEchoLines}");
  });

  it("leaves the widget's separate, local analysis alone", () => {
    // Out of scope by design: the widget has its own implementation and keeps
    // rotating the generic lines only.
    expect(WIDGET_SOURCE).toContain("INTERSTITIAL_LINES");
    expect(WIDGET_SOURCE).not.toContain("buildAnalysisEchoes");
    expect(WIDGET_SOURCE).not.toContain("analysisLineSequence");
  });
});
