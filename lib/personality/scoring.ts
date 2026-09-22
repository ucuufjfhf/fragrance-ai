import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type {
  PersonalityBounds,
  PersonalityDimension,
  PersonalityScores,
  PersonalityVector,
  QuizAnswer,
  QuizQuestion,
  QuizResult,
} from "@/types/personality";
import { nearestArchetype } from "@/lib/personality/archetypes";
import { QUIZ_QUESTIONS, getOptionById } from "@/lib/personality/questions";

function buildScores(
  create: (dimension: PersonalityDimension) => number,
): PersonalityScores {
  const entries = PERSONALITY_DIMENSIONS.map(
    (dimension) => [dimension, create(dimension)] as const,
  );
  return Object.fromEntries(entries) as PersonalityScores;
}

function zeroScores(): PersonalityScores {
  return buildScores(() => 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Lower/upper raw sum that each dimension can reach.
 *
 * `0` is always part of the candidate set because an option may leave a
 * dimension untouched. A dimension with no reachable range normalises to the
 * neutral value 50 (see `normalizeScores`).
 */
export function computeBounds(
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
): PersonalityBounds {
  const entries: Array<[PersonalityDimension, { min: number; max: number }]> = [];

  for (const dimension of PERSONALITY_DIMENSIONS) {
    let min = 0;
    let max = 0;

    for (const question of questions) {
      const deltas = question.options.map(
        (option) => option.vector[dimension] ?? 0,
      );
      min += Math.min(0, ...deltas);
      max += Math.max(0, ...deltas);
    }

    entries.push([dimension, { min, max }]);
  }

  return Object.fromEntries(entries) as PersonalityBounds;
}

const DEFAULT_BOUNDS = computeBounds(QUIZ_QUESTIONS);

/**
 * Keeps the answers that actually influence the score, in question order.
 *
 * Lenient by design: unknown questions/options are dropped and the first answer
 * per question wins, so a duplicated or reordered payload can never change the
 * computed profile. Strict payload validation lives in `validateAnswers`.
 */
export function orderAnswers(
  answers: readonly QuizAnswer[],
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
): QuizAnswer[] {
  const ordered: QuizAnswer[] = [];

  for (const question of questions) {
    const match = answers.find(
      (answer) =>
        answer?.questionId === question.id &&
        getOptionById(question, answer.optionId) !== undefined,
    );

    if (match) {
      ordered.push({ questionId: question.id, optionId: match.optionId });
    }
  }

  return ordered;
}

/** Sums the raw scoring vectors of the ordered answers. */
export function accumulateRawScores(
  answers: readonly QuizAnswer[],
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
): PersonalityScores {
  const scores = zeroScores();

  for (const answer of orderAnswers(answers, questions)) {
    const question = questions.find((item) => item.id === answer.questionId);
    const option = question
      ? getOptionById(question, answer.optionId)
      : undefined;

    if (!option) {
      continue;
    }

    for (const [dimension, delta] of Object.entries(option.vector)) {
      scores[dimension as PersonalityDimension] += delta ?? 0;
    }
  }

  return scores;
}

/**
 * Maps raw sums onto the 0–100 range using the bounds of the quiz itself, so a
 * user who always picks the options maximising a dimension reaches exactly 100.
 */
export function normalizeScores(
  raw: PersonalityScores,
  bounds: PersonalityBounds = DEFAULT_BOUNDS,
): PersonalityVector {
  const entries: Array<[PersonalityDimension, number]> = [];

  for (const dimension of PERSONALITY_DIMENSIONS) {
    const { min, max } = bounds[dimension];
    const span = max - min;

    if (span <= 0) {
      entries.push([dimension, 50]);
      continue;
    }

    const value = ((raw[dimension] - min) / span) * 100;
    entries.push([dimension, clamp(Math.round(value), 0, 100)]);
  }

  return Object.fromEntries(entries) as PersonalityVector;
}

/** Full deterministic pipeline: answers → raw sums → 0–100 vector → archetype. */
export function scoreQuiz(
  answers: readonly QuizAnswer[],
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
): QuizResult {
  const raw = accumulateRawScores(answers, questions);
  const vector = normalizeScores(raw, computeBounds(questions));

  return {
    answers: orderAnswers(answers, questions),
    raw,
    vector,
    archetype: nearestArchetype(vector),
  };
}

export type AnswersValidation =
  | { ok: true; answers: QuizAnswer[] }
  | { ok: false; reason: string };

/**
 * Strict validation for untrusted payloads (`POST /api/quiz/submit`).
 *
 * Rules: an array, exactly one answer per question, string ids that exist, and
 * no duplicate questions. Reasons are developer-facing English strings; the UI
 * shows its own Persian copy.
 */
export function validateAnswers(
  input: unknown,
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
): AnswersValidation {
  if (!Array.isArray(input)) {
    return { ok: false, reason: "answers must be an array." };
  }

  if (input.length !== questions.length) {
    return {
      ok: false,
      reason: `expected ${questions.length} answers, received ${input.length}.`,
    };
  }

  const answers: QuizAnswer[] = [];
  const seen = new Set<string>();

  for (const [index, item] of input.entries()) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, reason: `answer #${index + 1} must be an object.` };
    }

    const { questionId, optionId } = item as Record<string, unknown>;

    if (
      typeof questionId !== "string" ||
      typeof optionId !== "string" ||
      questionId.length === 0 ||
      optionId.length === 0
    ) {
      return {
        ok: false,
        reason: `answer #${index + 1} needs string questionId and optionId.`,
      };
    }

    const question = questions.find((candidate) => candidate.id === questionId);

    if (!question) {
      return { ok: false, reason: `unknown question "${questionId}".` };
    }

    if (seen.has(questionId)) {
      return {
        ok: false,
        reason: `duplicate answer for question "${questionId}".`,
      };
    }

    if (!getOptionById(question, optionId)) {
      return {
        ok: false,
        reason: `unknown option "${optionId}" for question "${questionId}".`,
      };
    }

    seen.add(questionId);
    answers.push({ questionId, optionId });
  }

  return { ok: true, answers };
}
