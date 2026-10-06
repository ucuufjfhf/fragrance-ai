import { isAudienceGender, type AudienceGender } from "@/lib/audience";
import { QUIZ_QUESTIONS, getOptionById } from "@/lib/personality/questions";
import type { QuizAnswer, QuizQuestion } from "@/types/personality";

/**
 * Framework-free state machine for the quiz UI.
 *
 * Every transition is a pure function of the previous state, which keeps the
 * one-question-per-screen flow, the previous/next buttons and the restart
 * behaviour deterministic and unit-testable without a DOM or a browser.
 *
 * Flow: intro → audience → Q1…Q10 → result.
 *
 * The audience step is a single screen of its own between the intro and the
 * first question. It is NOT one of the 10 personality questions: it never enters
 * `selections`, never reaches the scorer, and the progress indicator still reads
 * «سؤال ۱ از ۱۰» the moment Q1 renders (see `getProgress`).
 */
export type QuizPhase = "intro" | "audience" | "question" | "result";

export interface QuizFlowState {
  phase: QuizPhase;
  /** 0-based index into the question list. */
  questionIndex: number;
  /** questionId → chosen optionId. */
  selections: Readonly<Record<string, string>>;
  /**
   * The audience selected on its own step before Q1 (`null` until chosen).
   * Merchandising context only — never part of the personality vector.
   */
  audience: AudienceGender | null;
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
  return { phase: "intro", questionIndex: 0, selections: {}, audience: null };
}

/**
 * Starts a fresh run at the AUDIENCE step (clears previous selections).
 *
 * The audience screen is the first step after the intro; picking an audience
 * moves the flow to Q1 through `selectAudience`.
 */
export function startQuiz(): QuizFlowState {
  return { phase: "audience", questionIndex: 0, selections: {}, audience: null };
}

/**
 * Legacy questions-only entry: begins directly at Q1 with no audience.
 *
 * Used by the embedded widget, whose Phase-8 flow and public API are frozen.
 * With no audience selected the engine applies no gender filter, so its
 * behaviour is byte-identical to the pre-audience contract.
 */
export function startQuizQuestions(): QuizFlowState {
  return { phase: "question", questionIndex: 0, selections: {}, audience: null };
}

/**
 * Records the audience choice and advances to the first question.
 *
 * Unknown values are ignored (the state is returned unchanged), mirroring
 * `selectAnswer`. The audience never touches `selections` or the score, and the
 * audience screen is never counted as a question.
 */
export function selectAudience(
  state: QuizFlowState,
  audience: unknown,
): QuizFlowState {
  if (!isAudienceGender(audience)) {
    return state;
  }

  return { ...state, audience, phase: "question", questionIndex: 0 };
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

/**
 * Moves back one question; from Q1 it returns to the audience step.
 *
 * Returning to the audience screen keeps the previous choice selected (the
 * state's `audience` is untouched), so changing the audience is one tap.
 */
export function goPrevious(state: QuizFlowState): QuizFlowState {
  if (state.phase !== "question") {
    return state;
  }

  if (state.questionIndex <= 0) {
    return { ...state, phase: "audience" };
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

/**
 * Progress for the «سؤال ۳ از ۱۰» label and the progress bar.
 *
 * Derived from the 10-question bank only: the audience step is not a question,
 * so Q1 still reports «سؤال ۱ از ۱۰» — never «۱۱».
 */
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
