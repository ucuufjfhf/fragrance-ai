import { describe, expect, it } from "vitest";

import {
  createInitialQuizFlowState,
  getProgress,
  goNext,
  goPrevious,
  isQuizComplete,
  openContext,
  restartQuiz,
  returnToResult,
  selectAnswer,
  selectAudience,
  selectOccasion,
  selectSeason,
  showResult,
  startQuiz,
  startQuizQuestions,
  toAnswers,
  type QuizFlowState,
} from "@/lib/personality/quiz-flow";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";

const TOTAL = QUIZ_QUESTIONS.length;

/** The state right after the audience step: Q1, with an audience selected. */
function startAfterAudience(audience: "MEN" | "WOMEN" = "MEN"): QuizFlowState {
  return selectAudience(startQuiz(), audience);
}

/** Answers every question with the option selected by `pick`. */
function completeFlow(pick: (questionIndex: number) => number = () => 0): QuizFlowState {
  let state = startAfterAudience();

  QUIZ_QUESTIONS.forEach((question, index) => {
    state = selectAnswer(state, question.id, question.options[pick(index)].id);
  });

  return state;
}

describe("quiz flow state machine", () => {
  it("starts on the intro screen with no selections", () => {
    const state = createInitialQuizFlowState();

    expect(state.phase).toBe("intro");
    expect(state.questionIndex).toBe(0);
    expect(state.selections).toEqual({});
    expect(state.audience).toBeNull();
  });

  it("hands out an independent state on every call (refresh safety)", () => {
    const first = createInitialQuizFlowState();
    const second = createInitialQuizFlowState();

    expect(first).not.toBe(second);

    const answered = selectAnswer(second, QUIZ_QUESTIONS[0].id, QUIZ_QUESTIONS[0].options[0].id);

    expect(answered).not.toBe(second);
    expect(first.selections).toEqual({});
    expect(second.selections).toEqual({});
  });

  it("starts a run at the audience step, before any question", () => {
    const state = startQuiz();

    expect(state.phase).toBe("audience");
    expect(state.questionIndex).toBe(0);
    expect(state.selections).toEqual({});
    expect(state.audience).toBeNull();
  });

  it("keeps the questions-only entry point (widget) starting at Q1 with no audience", () => {
    const state = startQuizQuestions();

    expect(state.phase).toBe("question");
    expect(state.questionIndex).toBe(0);
    expect(state.selections).toEqual({});
    expect(state.audience).toBeNull();
  });

  it("records the audience and advances to Q1 without touching the answer sheet", () => {
    const state = selectAudience(startQuiz(), "WOMEN");

    expect(state.phase).toBe("question");
    expect(state.questionIndex).toBe(0);
    expect(state.audience).toBe("WOMEN");
    expect(state.selections).toEqual({});
  });

  it("ignores unknown audience values", () => {
    const state = startQuiz();

    expect(selectAudience(state, "UNISEX")).toBe(state);
    expect(selectAudience(state, "")).toBe(state);
    expect(selectAudience(state, undefined)).toBe(state);
  });

  it("never counts the audience step as a question: Q1 still reports 1 of 10", () => {
    const state = selectAudience(startQuiz(), "MEN");

    expect(getProgress(state)).toEqual({ current: 1, total: 10, percent: 10 });
    expect(QUIZ_QUESTIONS).toHaveLength(10);
  });

  it("does not let the audience change the personality profile", () => {
    const pickSecond = (state: QuizFlowState): QuizFlowState =>
      QUIZ_QUESTIONS.reduce(
        (current, question) => selectAnswer(current, question.id, question.options[1].id),
        state,
      );

    const men = pickSecond(startAfterAudience("MEN"));
    const women = pickSecond(startAfterAudience("WOMEN"));

    expect(toAnswers(men)).toEqual(toAnswers(women));
    expect(scoreQuiz(toAnswers(men)).vector).toEqual(scoreQuiz(toAnswers(women)).vector);
    expect(scoreQuiz(toAnswers(men)).archetype.id).toBe(
      scoreQuiz(toAnswers(women)).archetype.id,
    );
  });

  it("records selections and ignores unknown question/option ids", () => {
    const question = QUIZ_QUESTIONS[0];
    const state = selectAnswer(startQuiz(), question.id, question.options[1].id);

    expect(state.selections[question.id]).toBe(question.options[1].id);

    const unknownQuestion = selectAnswer(state, "nope", question.options[0].id);
    const unknownOption = selectAnswer(state, question.id, "nope");

    expect(unknownQuestion).toBe(state);
    expect(unknownOption).toBe(state);
  });

  it("replaces the selection when the same question is answered again", () => {
    const question = QUIZ_QUESTIONS[0];
    let state = selectAnswer(startQuiz(), question.id, question.options[0].id);
    state = selectAnswer(state, question.id, question.options[1].id);

    expect(Object.keys(state.selections)).toHaveLength(1);
    expect(state.selections[question.id]).toBe(question.options[1].id);
  });

  it("moves forward and stops on the last question", () => {
    let state = startAfterAudience();

    for (let index = 1; index < TOTAL; index += 1) {
      state = goNext(state);
      expect(state.questionIndex).toBe(index);
    }

    expect(goNext(state).questionIndex).toBe(TOTAL - 1);
  });

  it("moves backward and returns to the audience step from Q1", () => {
    const state = goNext(goNext(startAfterAudience()));

    expect(state.questionIndex).toBe(2);
    expect(goPrevious(state).questionIndex).toBe(1);

    const firstQuestion = goPrevious(goPrevious(state));
    expect(firstQuestion.questionIndex).toBe(0);

    // Q1 → audience step, keeping the previous choice selected.
    const backToAudience = goPrevious(firstQuestion);
    expect(backToAudience.phase).toBe("audience");
    expect(backToAudience.audience).toBe("MEN");
    expect(backToAudience.selections).toEqual(firstQuestion.selections);

    // The audience screen is the first step: going back again is a no-op.
    expect(goPrevious(backToAudience)).toBe(backToAudience);

    // Re-picking the audience returns to Q1 with the new value.
    expect(selectAudience(backToAudience, "WOMEN")).toMatchObject({
      phase: "question",
      questionIndex: 0,
      audience: "WOMEN",
    });
  });

  it("is only complete once every question has an answer", () => {
    const partial = completeFlow();
    expect(isQuizComplete(partial)).toBe(true);

    const missingOne = QUIZ_QUESTIONS.slice(0, TOTAL - 1).reduce(
      (state, question) =>
        selectAnswer(state, question.id, question.options[0].id),
      startQuiz(),
    );

    expect(isQuizComplete(missingOne)).toBe(false);
    expect(isQuizComplete(startQuiz())).toBe(false);
  });

  it("only shows the result for a complete answer sheet", () => {
    expect(showResult(startQuiz()).phase).toBe("audience");
    expect(showResult(startAfterAudience()).phase).toBe("question");

    const complete = completeFlow();
    expect(showResult(complete).phase).toBe("result");
    expect(showResult(complete).selections).toEqual(complete.selections);
  });

  it("restarts back to the intro with all answers and the audience cleared", () => {
    const restarted = restartQuiz();

    expect(restarted.phase).toBe("intro");
    expect(restarted.questionIndex).toBe(0);
    expect(restarted.selections).toEqual({});
    expect(restarted.audience).toBeNull();
  });

  it("returns answers in question order regardless of selection order", () => {
    let state = startQuiz();

    for (const question of [...QUIZ_QUESTIONS].reverse()) {
      state = selectAnswer(state, question.id, question.options[0].id);
    }

    expect(toAnswers(state).map((answer) => answer.questionId)).toEqual(
      QUIZ_QUESTIONS.map((question) => question.id),
    );
  });

  it("reports progress from the first to the last question", () => {
    expect(getProgress(startQuiz())).toEqual({
      current: 1,
      total: TOTAL,
      percent: 10,
    });

    let state = startAfterAudience();

    for (let index = 1; index < TOTAL; index += 1) {
      state = goNext(state);
    }

    expect(getProgress(state)).toEqual({
      current: TOTAL,
      total: TOTAL,
      percent: 100,
    });
  });
});

describe("optional context step (season + occasion)", () => {
  /** The state right after the last question: the personality result screen. */
  function resultState(): QuizFlowState {
    return showResult(completeFlow());
  }

  it("starts every entry point with no context selected", () => {
    for (const state of [
      createInitialQuizFlowState(),
      startQuiz(),
      startQuizQuestions(),
    ]) {
      expect(state.season).toBeNull();
      expect(state.occasion).toBeNull();
    }
  });

  it("opens from the result screen only", () => {
    const fromResult = openContext(resultState());
    expect(fromResult.phase).toBe("context");

    // No result yet → no context screen (state unchanged).
    expect(openContext(createInitialQuizFlowState()).phase).toBe("intro");
    expect(openContext(startQuiz()).phase).toBe("audience");
    expect(openContext(startQuizQuestions()).phase).toBe("question");
  });

  it("records season and occasion selections without touching the answers", () => {
    const before = resultState();
    let state = openContext(before);

    state = selectSeason(state, "SUMMER");
    state = selectOccasion(state, "DATE");

    expect(state.season).toBe("SUMMER");
    expect(state.occasion).toBe("DATE");
    expect(state.selections).toEqual(before.selections);
    expect(state.phase).toBe("context");
  });

  it("accepts null as «فرقی نمی‌کنه» (clears back to no filter)", () => {
    let state = openContext(resultState());
    state = selectSeason(state, "WINTER");
    state = selectOccasion(state, "FORMAL");

    state = selectSeason(state, null);
    state = selectOccasion(state, null);

    expect(state.season).toBeNull();
    expect(state.occasion).toBeNull();
  });

  it("ignores unknown season and occasion values", () => {
    const before = openContext(resultState());

    const badSeason = selectSeason(before, "FALL" as never);
    const badOccasion = selectOccasion(before, "CASUAL" as never);

    expect(badSeason).toBe(before);
    expect(badOccasion).toBe(before);
  });

  it("returns from the context step to the result screen, keeping selections", () => {
    let state = openContext(resultState());
    state = selectSeason(state, "AUTUMN");

    const back = returnToResult(state);
    expect(back.phase).toBe("result");
    expect(back.season).toBe("AUTUMN");

    // A no-op anywhere else (state returned untouched, same reference).
    expect(returnToResult(back)).toBe(back);

    const audienceState = startQuiz();
    expect(returnToResult(audienceState)).toBe(audienceState);
  });

  it("restart clears the context selections along with everything else", () => {
    let state = openContext(resultState());
    state = selectSeason(state, "SPRING");
    state = selectOccasion(state, "PARTY");

    // The selections really are set before the restart clears them.
    expect(state.season).toBe("SPRING");
    expect(state.occasion).toBe("PARTY");

    const restarted = restartQuiz();
    expect(restarted.season).toBeNull();
    expect(restarted.occasion).toBeNull();
    expect(restarted.phase).toBe("intro");
  });

  it("context selection never changes the personality vector or archetype", () => {
    const before = resultState();
    const baseline = scoreQuiz(toAnswers(before));

    let state = openContext(before);
    state = selectSeason(state, "SUMMER");
    state = selectOccasion(state, "OFFICE");
    state = selectSeason(state, "WINTER");
    state = selectOccasion(state, null);

    // The answer sheet — the scorer's ONLY input — is byte-identical.
    expect(toAnswers(state)).toEqual(toAnswers(before));
    expect(state.selections).toEqual(before.selections);

    const after = scoreQuiz(toAnswers(state));
    expect(after.vector).toEqual(baseline.vector);
    expect(after.archetype.id).toBe(baseline.archetype.id);
    expect(after).toEqual(baseline);
  });

  it("the context step is never counted as a question", () => {
    const state = openContext(resultState());

    // Progress derives from the 10-question bank only — identical to the
    // result screen, never an 11th step and never beyond 100%.
    expect(getProgress(state)).toEqual(getProgress(resultState()));
    expect(getProgress(state).total).toBe(TOTAL);
    expect(getProgress(state).percent).toBeLessThanOrEqual(100);
  });
});
