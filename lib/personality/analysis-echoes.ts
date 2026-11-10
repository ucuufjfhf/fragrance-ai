import { getOptionById, getQuestionById } from "@/lib/personality/questions";
import type { QuizAnswer } from "@/types/personality";

/**
 * The performed-analysis echo (batch 30).
 *
 * The interstitial already performs a wait; these lines make the wait read as
 * work done for THIS shopper by quoting their own answer back. Two questions
 * only — `scent-role` (why they wear a fragrance) and `usage` (when) — because
 * they are the two most identity-laden answers in the bank. Everything here is
 * derived from the stored sheet: the quote is a verbatim substring of the
 * option's own label (never retyped, so ZWNJ and punctuation always match), and
 * a missing or unknown answer simply produces no echo.
 */

/** The only two questions that may be quoted back. */
export const ECHO_QUESTION_IDS = ["scent-role", "usage"] as const;

export type EchoQuestionId = (typeof ECHO_QUESTION_IDS)[number];

/** At most two echoes, one per echo question: the wait is short. */
export const MAX_ANALYSIS_ECHOES = 2;

/**
 * What the engine does with each answer — short, warm, شما register (the stage's
 * existing voice), no emojis. Keyed by `questionId:optionId` so a copy line can
 * never drift onto the wrong option.
 */
export const ANALYSIS_ECHO_CONSEQUENCES: Readonly<Record<string, string>> = {
  "scent-role:signature": "دنبال رایحه‌های موندگارتر می‌گردیم",
  "scent-role:freshness": "روی رایحه‌های تمیز و سبک تمرکز می‌کنیم",
  "scent-role:mood": "رایحه‌های آرام و شخصی رو پررنگ می‌کنیم",
  "usage:everyday": "انتخاب‌ها رو به سمت عطرهای روزانه می‌بریم",
  "usage:evening": "عطرهای شب و موقعیت‌های خاص رو جلو می‌ذاریم",
  "usage:energize": "رایحه‌های سرحال‌کننده رو در اولویت می‌گذاریم",
};

export interface AnalysisEcho {
  questionId: EchoQuestionId;
  optionId: string;
  /** The chosen option's label, verbatim from the bank. */
  optionLabel: string;
  /** The quoted part — always a verbatim substring of `optionLabel`. */
  quote: string;
  /** What that answer makes the engine do. */
  consequence: string;
  /** The rendered line: «گفتید: «{quote}» — {consequence}…». */
  line: string;
}

/**
 * The quotable part of an answer label: its first clause where the copy carries
 * a «؛» (the natural half-sentence), otherwise the whole label. Only trailing
 * full stops / ellipses are trimmed, so the result always remains a verbatim
 * substring — nothing is rewritten or re-punctuated.
 */
export function quoteFromOptionLabel(label: string): string {
  const [firstClause] = label.split("؛");
  const quote = (firstClause ?? label).trim().replace(/[.…]+$/u, "").trim();
  return quote.length > 0 ? quote : label;
}

/**
 * Up to two echo lines from the recorded answers, in bank order. An answer to
 * any other question, a missing answer or an unknown option contributes
 * nothing — with an empty sheet the result is empty and the interstitial falls
 * back to its original generic rotation.
 */
export function buildAnalysisEchoes(
  answers: readonly QuizAnswer[],
): AnalysisEcho[] {
  const echoes: AnalysisEcho[] = [];

  for (const questionId of ECHO_QUESTION_IDS) {
    if (echoes.length >= MAX_ANALYSIS_ECHOES) {
      break;
    }

    const answer = answers.find(
      (candidate) => candidate?.questionId === questionId,
    );
    if (!answer) {
      continue;
    }

    const question = getQuestionById(questionId);
    if (!question) {
      continue;
    }

    const option = getOptionById(question, answer.optionId);
    if (!option) {
      continue;
    }

    const consequence =
      ANALYSIS_ECHO_CONSEQUENCES[`${questionId}:${option.id}`];
    if (!consequence) {
      continue;
    }

    const quote = quoteFromOptionLabel(option.label);
    echoes.push({
      questionId,
      optionId: option.id,
      optionLabel: option.label,
      quote,
      consequence,
      line: `گفتید: «${quote}» — ${consequence}…`,
    });
  }

  return echoes;
}
