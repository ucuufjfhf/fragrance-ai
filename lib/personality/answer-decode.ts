import { PERSONALITY_LABELS } from "@/lib/personality/labels";
import { QUIZ_QUESTIONS, getOptionById } from "@/lib/personality/questions";
import {
  PERSONALITY_DIMENSIONS,
  type PersonalityDimension,
  type PersonalityVector,
  type QuizAnswer,
  type QuizQuestion,
} from "@/types/personality";

/**
 * “How did I get here” decode (Phase 3, Pinrose lineage).
 *
 * The centroid explainer says HOW the archetype was picked (nearest match over
 * all 9 axes — systemic). This module says what YOU did (personal): which of
 * the shopper's own recorded answers pushed hardest on the profile's top
 * axes, shown as their answer labels mapped to profile traits.
 *
 * Truthfulness is structural, never editorial:
 *  - every item names a REAL recorded answer (unknown questions/options are
 *    dropped, exactly like the scorer's `orderAnswers` leniency);
 *  - every answer→trait link is the option's OWN scoring vector — the same
 *    deltas the engine summed — never an invented association;
 *  - an answer with no positive push on an axis (delta ≤ 0) can never appear
 *    for that axis: if nothing moved the needle, nothing is shown;
 *  - the share is arithmetic: the answer's delta over the sheet's total
 *    positive push on that axis — a computed number, never a narrative.
 */

/** One decoded answer→trait link, ready to render. */
export interface DecodedAnswer {
  questionId: string;
  /** The question prompt, verbatim from the bank (context, not a claim). */
  questionPrompt: string;
  optionId: string;
  /** The shopper's own answer label, verbatim from the bank. */
  optionLabel: string;
  dimension: PersonalityDimension;
  /** The profile trait this answer pushed hardest on. */
  traitLabel: string;
  /**
   * 0–1 share of the sheet's total positive push on that trait. Rounded to
   * two decimals for display; never fabricated, always derived.
   */
  share: number;
}

/** At most three links: the decode is a footnote, not a ledger. */
export const MAX_DECODED_ANSWERS = 3;

/**
 * Dimensions in profile order: highest vector value first, canonical bank
 * order breaking ties — the same determinism the engine promises everywhere.
 */
function rankDimensions(vector: PersonalityVector): PersonalityDimension[] {
  return [...PERSONALITY_DIMENSIONS].sort((a, b) => {
    if (vector[b] !== vector[a]) {
      return vector[b] - vector[a];
    }
    return (
      PERSONALITY_DIMENSIONS.indexOf(a) - PERSONALITY_DIMENSIONS.indexOf(b)
    );
  });
}

interface ResolvedAnswer {
  question: QuizQuestion;
  optionId: string;
  optionLabel: string;
}

/** The sheet resolved against the bank: unknown pairs vanish, order kept. */
function resolveSheet(
  answers: readonly QuizAnswer[],
  questions: readonly QuizQuestion[],
): ResolvedAnswer[] {
  const resolved: ResolvedAnswer[] = [];
  const seen = new Set<string>();

  for (const question of questions) {
    if (seen.has(question.id)) {
      continue;
    }
    seen.add(question.id);

    const match = answers.find(
      (answer) => answer?.questionId === question.id,
    );
    if (!match) {
      continue;
    }

    const option = getOptionById(question, match.optionId);
    if (!option) {
      continue;
    }

    resolved.push({
      question,
      optionId: option.id,
      optionLabel: option.label,
    });
  }

  return resolved;
}

/**
 * Decodes a recorded answer sheet into at most three answer→trait links.
 *
 * Walks the profile's top axes and, per axis, takes the unused recorded
 * answer with the largest positive delta on it. An axis with no positive
 * push left contributes nothing — silence instead of invention.
 */
export function decodeAnswers(
  answers: readonly QuizAnswer[],
  vector: PersonalityVector,
  questions: readonly QuizQuestion[] = QUIZ_QUESTIONS,
  maxItems: number = MAX_DECODED_ANSWERS,
): DecodedAnswer[] {
  const sheet = resolveSheet(answers, questions);
  if (sheet.length === 0 || maxItems < 1) {
    return [];
  }

  const used = new Set<string>();
  const decoded: DecodedAnswer[] = [];

  for (const dimension of rankDimensions(vector)) {
    if (decoded.length >= maxItems) {
      break;
    }

    let best: ResolvedAnswer | null = null;
    let bestDelta = 0;

    for (const entry of sheet) {
      if (used.has(entry.question.id)) {
        continue;
      }

      const option = getOptionById(entry.question, entry.optionId);
      const delta = option?.vector[dimension] ?? 0;

      if (delta > bestDelta) {
        bestDelta = delta;
        best = entry;
      }
    }

    if (!best) {
      continue;
    }

    const total = sheet.reduce((sum, entry) => {
      if (used.has(entry.question.id)) {
        return sum;
      }
      const option = getOptionById(entry.question, entry.optionId);
      return sum + Math.max(0, option?.vector[dimension] ?? 0);
    }, 0);

    if (total <= 0) {
      continue;
    }

    used.add(best.question.id);
    decoded.push({
      questionId: best.question.id,
      questionPrompt: best.question.prompt,
      optionId: best.optionId,
      optionLabel: best.optionLabel,
      dimension,
      traitLabel: PERSONALITY_LABELS[dimension],
      share: Math.round((bestDelta / total) * 100) / 100,
    });
  }

  return decoded;
}
