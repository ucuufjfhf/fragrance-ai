import { describe, expect, it } from "vitest";

import {
  createInitialQuizFlowState,
  getProgress,
  goNext,
  goPrevious,
  isQuizComplete,
  restartQuiz,
  selectAnswer,
  showResult,
  startQuiz,
  toAnswers,
  type QuizFlowState,
} from "@/lib/personality/quiz-flow";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";

const TOTAL = QUIZ_QUESTIONS.length;

/** Answers every question with the option selected by `pick`. */
function completeFlow(pick: (questionIndex: number) => number = () => 0): QuizFlowState {
  let state = startQuiz();

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

  it("starts a run at the first question", () => {
    const state = startQuiz();

    expect(state.phase).toBe("question");
    expect(state.questionIndex).toBe(0);
    expect(state.selections).toEqual({});
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
    let state = startQuiz();

    for (let index = 1; index < TOTAL; index += 1) {
      state = goNext(state);
      expect(state.questionIndex).toBe(index);
    }

    expect(goNext(state).questionIndex).toBe(TOTAL - 1);
  });

  it("moves backward and stops on the first question", () => {
    const state = goNext(goNext(startQuiz()));

    expect(state.questionIndex).toBe(2);
    expect(goPrevious(state).questionIndex).toBe(1);

    const firstQuestion = goPrevious(goPrevious(state));

    expect(firstQuestion.questionIndex).toBe(0);
    expect(goPrevious(firstQuestion)).toBe(firstQuestion);
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
    expect(showResult(startQuiz()).phase).toBe("question");

    const complete = completeFlow();
    expect(showResult(complete).phase).toBe("result");
    expect(showResult(complete).selections).toEqual(complete.selections);
  });

  it("restarts back to the intro with all answers cleared", () => {
    const restarted = restartQuiz();

    expect(restarted.phase).toBe("intro");
    expect(restarted.questionIndex).toBe(0);
    expect(restarted.selections).toEqual({});
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

    let state = startQuiz();

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
