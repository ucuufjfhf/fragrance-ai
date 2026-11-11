import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProgressBar from "@/components/quiz/ProgressBar";
import Question from "@/components/quiz/Question";
import Quiz from "@/components/quiz/Quiz";
import { AUDIENCE_QUESTION } from "@/lib/audience";
import {
  MINI_QUIZ_QUESTION_ID,
  createInitialQuizFlowState,
  getProgress,
  goPrevious,
  parseMiniQuizAnswer,
  restartQuiz,
  selectAnswer,
  selectAudience,
  selectAudienceSkippingAnswer,
  startQuiz,
  startQuizWithAnswer,
  toAnswers,
  type QuizFlowState,
} from "@/lib/personality/quiz-flow";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";

/**
 * Batch 38 — the hero's Q1 answer carried into /quiz.
 *
 * The carry is the `?q1=<optionId>` URL parameter: it survives the real
 * navigation from `/` and a refresh of /quiz, and the value is re-validated
 * against the bank on every arrival. These pins cover that validation, the
 * resumed flow (audience → Q2 → back to a changeable Q1), the single
 * QUIZ_STARTED of the attempt and the restart that clears the pre-answer.
 * Interaction is exercised through the pure state machine; SSR markup proves
 * the screens the shopper actually gets.
 */

function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

/** Visible text with the markup stripped: the intro headline wraps one word in
 * the marker-wipe span, so its copy is contiguous only in what is read. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

const QUIZ_SOURCE = readFileSync(
  new URL("../../components/quiz/Quiz.tsx", import.meta.url),
  "utf8",
);

const noopSelect = (): void => undefined;
const first = QUIZ_QUESTIONS[0];
const carried = "explore";

/** Answers Q2…Q10 (from `startIndex`) with each question's first option. */
function answerFrom(state: QuizFlowState, startIndex: number): QuizFlowState {
  let next = state;
  for (let index = startIndex; index < QUIZ_QUESTIONS.length; index += 1) {
    const question = QUIZ_QUESTIONS[index];
    next = selectAnswer(next, question.id, question.options[0].id);
  }
  return next;
}

/** The button block for one option in a rendered question screen. */
function optionCard(html: string, optionId: string): string {
  const card = html
    .split("<button")
    .slice(1)
    .find((entry) => entry.includes(`data-option-id="${optionId}"`));
  expect(card, `no option row for ${optionId}`).toBeDefined();
  return card!;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the carried value is validated against the bank", () => {
  it("accepts exactly Q1's real option ids", () => {
    for (const option of first.options) {
      expect(parseMiniQuizAnswer(option.id)).toBe(option.id);
    }
  });

  it("drops anything that is not a Q1 option — silently", () => {
    const otherQuestionOption = QUIZ_QUESTIONS[1].options[0].id;

    for (const raw of [
      undefined,
      null,
      "",
      "   ",
      "nope",
      otherQuestionOption,
      42,
      {},
      [],
    ]) {
      expect(parseMiniQuizAnswer(raw)).toBeNull();
    }
  });

  it("reads a repeated ?q1= as its first value, and trims it", () => {
    expect(parseMiniQuizAnswer(["explore", "trusted"])).toBe("explore");
    expect(parseMiniQuizAnswer(" explore ")).toBe("explore");
    expect(parseMiniQuizAnswer(["nope", "explore"])).toBeNull();
  });
});

describe("startQuizWithAnswer — a resumed attempt", () => {
  it("starts at the audience step with Q1 already answered", () => {
    const state = startQuizWithAnswer(carried)!;

    expect(state.phase).toBe("audience");
    expect(state.questionIndex).toBe(0);
    expect(state.selections).toEqual({ [MINI_QUIZ_QUESTION_ID]: carried });
    // The audience is still unselected: it comes before Q1, unscored.
    expect(state.audience).toBeNull();
    expect(state.season).toBeNull();
    expect(state.occasion).toBeNull();
  });

  it("refuses an invalid carry, leaving the fresh intro as the fallback", () => {
    expect(startQuizWithAnswer("not-an-option")).toBeNull();
    expect(startQuizWithAnswer(undefined)).toBeNull();
    expect(createInitialQuizFlowState().phase).toBe("intro");
    expect(createInitialQuizFlowState().selections).toEqual({});
  });
});

describe("resumed flow — audience to Q2, back to a changeable Q1", () => {
  const atQ2 = selectAudienceSkippingAnswer(startQuizWithAnswer(carried)!, "WOMEN");

  it("advances the audience answer straight to Q2, reading 2 of 10", () => {
    expect(atQ2.phase).toBe("question");
    expect(atQ2.questionIndex).toBe(1);
    expect(atQ2.audience).toBe("WOMEN");
    expect(atQ2.selections).toEqual({ [MINI_QUIZ_QUESTION_ID]: carried });

    expect(getProgress(atQ2)).toEqual({ current: 2, total: 10, percent: 20 });
    // The label the shopper actually sees.
    expect(render(<ProgressBar current={2} total={10} />)).toContain("سؤال ۲ از ۱۰");
  });

  it("keeps the answered Q1 behind its back button, preselected and changeable", () => {
    const back = goPrevious(atQ2);

    expect(back.questionIndex).toBe(0);
    expect(back.phase).toBe("question");
    expect(back.selections[MINI_QUIZ_QUESTION_ID]).toBe(carried);

    // The Q1 screen renders the hero's option as the pressed row — through the
    // ordinary `selectedOptionId` machinery, not a second question UI.
    const html = render(
      <Question
        question={first}
        selectedOptionId={back.selections[MINI_QUIZ_QUESTION_ID]}
        onSelect={noopSelect}
      />,
    );
    expect(html.match(/aria-pressed="true"/g) ?? []).toHaveLength(1);
    expect(optionCard(html, carried)).toContain('aria-pressed="true"');

    // Changing it is the normal answer tap: the selection is replaced, still
    // one answer for Q1.
    const changed = selectAnswer(back, first.id, "trusted");
    expect(changed.selections).toEqual({ [MINI_QUIZ_QUESTION_ID]: "trusted" });

    const changedHtml = render(
      <Question
        question={first}
        selectedOptionId={changed.selections[first.id]}
        onSelect={noopSelect}
      />,
    );
    expect(optionCard(changedHtml, "trusted")).toContain('aria-pressed="true"');
    expect(optionCard(changedHtml, carried)).toContain('aria-pressed="false"');
  });

  it("keeps the fresh path unchanged: audience then Q1 at index 0", () => {
    const fresh = selectAudienceSkippingAnswer(startQuiz(), "MEN");

    expect(fresh.questionIndex).toBe(0);
    expect(fresh.selections).toEqual({});
    // An unknown audience is still a no-op, exactly like `selectAudience`.
    const audienceState = startQuizWithAnswer(carried)!;
    expect(selectAudienceSkippingAnswer(audienceState, "UNISEX")).toBe(audienceState);
  });

  it("scores the carried answer through the same path as an in-quiz tap", () => {
    const carriedSheet = answerFrom(atQ2, atQ2.questionIndex);
    const tappedSheet = answerFrom(
      selectAnswer(selectAudience(startQuiz(), "WOMEN"), MINI_QUIZ_QUESTION_ID, carried),
      1,
    );

    expect(toAnswers(carriedSheet)).toHaveLength(QUIZ_QUESTIONS.length);
    expect(toAnswers(carriedSheet)[0]).toEqual({
      questionId: MINI_QUIZ_QUESTION_ID,
      optionId: carried,
    });
    // One answer sheet, one scorer: no second scoring path.
    expect(toAnswers(carriedSheet)).toEqual(toAnswers(tappedSheet));

    const carriedResult = scoreQuiz(toAnswers(carriedSheet));
    const tappedResult = scoreQuiz(toAnswers(tappedSheet));
    expect(carriedResult.vector).toEqual(tappedResult.vector);
    expect(carriedResult.archetype.id).toBe(tappedResult.archetype.id);
  });

  it("restarts to a clean attempt with no hero answer inherited", () => {
    const restarted = restartQuiz();

    expect(restarted).toEqual(createInitialQuizFlowState());
    expect(restarted.phase).toBe("intro");
    expect(restarted.selections).toEqual({});
    expect(restarted.audience).toBeNull();
  });
});

describe("/quiz renders the right entry screen", () => {
  it("starts a valid carry on the audience step — never the intro", () => {
    const html = render(<Quiz carriedOptionId={carried} />);

    expect(html).toContain(AUDIENCE_QUESTION);
    expect(textOf(html)).not.toContain("عطر مناسب خودتون رو پیدا کنید");
    expect(html).not.toContain("شروع آزمون");
    // The audience screen is not a question: no progress label yet.
    expect(html).not.toContain("سؤال");
  });

  it("starts an invalid or missing carry on the ordinary intro", () => {
    for (const element of [
      <Quiz carriedOptionId="not-an-option" />,
      <Quiz carriedOptionId="" />,
      <Quiz carriedOptionId={undefined} />,
      <Quiz />,
    ]) {
      const html = render(element);
      expect(textOf(html)).toContain("عطر مناسب خودتون رو پیدا کنید");
      expect(html).toContain("شروع آزمون");
      expect(html).not.toContain(AUDIENCE_QUESTION);
    }
  });

  it("still renders Q1 through the one shared question screen", () => {
    // The pre-selected option is the shipped `Question`'s own prop — no second
    // question UI was added for the carry.
    expect(QUIZ_SOURCE).toContain("selectedOptionId={selectedOptionId}");
    expect(QUIZ_SOURCE.match(/<Question\b/g) ?? []).toHaveLength(1);
    expect(QUIZ_SOURCE).toContain("const canContinue = typeof selectedOptionId === \"string\";");
  });
});

describe("analytics — one QUIZ_STARTED per attempt", () => {
  it("fires on the resumed arrival, once, from a mount effect", () => {
    const start = QUIZ_SOURCE.indexOf("const resumedStartTracked = useRef(false);");
    expect(start, "no resumed-entry analytics guard").toBeGreaterThan(-1);
    const effect = QUIZ_SOURCE.slice(
      start,
      QUIZ_SOURCE.indexOf("}, [carriedAnswer, storeId]);", start),
    );

    expect(effect).toContain("useEffect(");
    expect(effect).toContain("if (carriedAnswer === null || resumedStartTracked.current)");
    // Batch 46: the resumed arrival is the hero entry, so its call carries the
    // marker; the intro button stays bare. Both exact forms are pinned once.
    expect(effect).toContain('trackQuizStarted(storeId, "hero")');
    // Exactly two call sites on the quiz. The homepage itself carries no
    // analytics at all.
    expect(QUIZ_SOURCE.match(/trackQuizStarted\(storeId, "hero"\)/g) ?? []).toHaveLength(1);
    expect(QUIZ_SOURCE.match(/trackQuizStarted\(storeId\)/g) ?? []).toHaveLength(1);
  });

  it("tracks the once-per-attempt guard the resumed entry relies on", async () => {
    vi.resetModules();
    const fetchMock = vi.fn(
      async (_input: unknown, _init?: RequestInit) => ({ ok: true }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const tracker = await import("@/lib/analytics/flow-tracker");

    tracker.trackQuizStarted("store-x");
    tracker.trackQuizStarted("store-x");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.eventType).toBe("QUIZ_STARTED");
    expect(payload.storeId).toBe("store-x");

    // A restart is a new attempt: the guard clears and the next entry fires.
    tracker.resetAnalyticsFlow();
    tracker.trackQuizStarted();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops the URL carry on restart, so a new attempt cannot inherit it", () => {
    const restartAt = QUIZ_SOURCE.indexOf("const handleRestart = useCallback(");
    expect(restartAt).toBeGreaterThan(-1);
    const body = QUIZ_SOURCE.slice(
      restartAt,
      QUIZ_SOURCE.indexOf("const handleSubmit", restartAt),
    );

    expect(body).toContain("setFlow(restartQuiz())");
    expect(body).toContain("skipAnsweredQuestion.current = false;");
    expect(body).toContain("carriedAnswer !== null");
    expect(body).toContain("router.replace(cleanHref)");
    expect(body).toContain("window.history.replaceState");
    expect(body).toContain("[carriedAnswer, router, storeId]");
  });
});
