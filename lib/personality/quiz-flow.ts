import { QUIZ_QUESTIONS, getOptionById } from "@/lib/personality/questions";
import type { QuizAnswer, QuizQuestion } from "@/types/personality";

/**
 * Framework-free state machine for the quiz UI.
 *
 * Every transition is a pure function of the previous state, which keeps the
 * one-question-per-screen flow, the previous/next buttons and the restart
 * behaviour deterministic and unit-testable without a DOM or a browser.
 */
export type QuizPhase = "intro" | "question" | "result";

export interface QuizFlowState {
  phase: QuizPhase;
  /** 0-based index into the question list. */
  questionIndex: number;
  /** questionId → chosen optionId. */
  selections: Readonly<Record<string, string>>;
}

export interface QuizProgress {
  /** 1-based position of the current question. */
  current: number;
  total: number;
  /** 0–100 completion, derived from the current question. */
  percent: number;
}

/**
 * A brand new, empty state. Returns a fresh object every call, so a page
 * refresh (or a remount) can never inherit selections from a previous run.
 */
export function createInitialQuizFlowState(): QuizFlowState {
  return { phase: "intro", questionIndex: 0, selections: {} };
}

/** Starts a fresh run at the first question (clears previous selections). */
export function startQuiz(): QuizFlowState {
  return { phase: "question", questionIndex: 0, selections: {} };
}

/** Restart returns to the intro screen with all answers cleared. */
export function restartQuiz(): QuizFlowState {
  return createInitialQuizFlowState();
}

/**
 * Records the chosen option. Unknown questions/options are ignored instead of
 * throwing, so a stale UI can never corrupt the state.
 */
export function selectAnswer(
  state: QuizFlowState,
  questionId: string,
  optionId: string,
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
): QuizFlowState {
  const question = questions.find((item) => item.id === questionId);

  if (!question || !getOptionById(question, optionId)) {
    return state;
  }

  return {
    ...state,
    selections: { ...state.selections, [questionId]: optionId },
  };
}

/** Moves to the next question; a no-op on the last question. */
export function goNext(
  state: QuizFlowState,
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
): QuizFlowState {
  if (state.phase !== "question" || state.questionIndex >= questions.length - 1) {
    return state;
  }

  return { ...state, questionIndex: state.questionIndex + 1 };
}

/** Moves back one question; a no-op on the first question. */
export function goPrevious(state: QuizFlowState): QuizFlowState {
  if (state.phase !== "question" || state.questionIndex <= 0) {
    return state;
  }

  return { ...state, questionIndex: state.questionIndex - 1 };
}

/** True once every question has a selection. */
export function isQuizComplete(
  state: QuizFlowState,
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
): boolean {
  return questions.every(
    (question) => typeof state.selections[question.id] === "string",
  );
}

/** Switches to the result screen, but only for a complete answer sheet. */
export function showResult(
  state: QuizFlowState,
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
): QuizFlowState {
  if (!isQuizComplete(state, questions)) {
    return state;
  }

  return { ...state, phase: "result" };
}

/** Selected answers in question order — the payload shape the API expects. */
export function toAnswers(
  state: QuizFlowState,
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
): QuizAnswer[] {
  return questions
    .filter((question) => typeof state.selections[question.id] === "string")
    .map((question) => ({
      questionId: question.id,
      optionId: state.selections[question.id],
    }));
}

/** Progress for the «سؤال ۳ از ۱۰» label and the progress bar. */
export function getProgress(
  state: QuizFlowState,
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
): QuizProgress {
  const total = questions.length;
  const current = total === 0 ? 0 : Math.min(state.questionIndex + 1, total);

  return {
    current,
    total,
    percent: total === 0 ? 0 : Math.round((current / total) * 100),
  };
}
