import { getImageProps } from "next/image";

import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { questionIllustrationFor } from "@/lib/quiz/question-illustrations";

/**
 * The one `sizes` value every question scene uses. It is shared by the visible
 * layer and the preload, so both resolve to the same candidate the browser will
 * actually pick.
 */
export const ILLUSTRATION_SIZES = "(max-width: 1024px) 100vw, 1024px";

export interface IllustrationPreload {
  src: string;
  srcSet: string;
  sizes: string;
}

/**
 * The artwork of the question that follows `questionId`, resolved to the exact
 * URLs `next/image` requests for it.
 *
 * The quiz order is static (`lib/personality/questions.ts`) and the widget runs
 * this same shared `Question` over the same bank, so warming N+1 while N is on
 * screen cannot desynchronise anything. The last question has no successor,
 * hence null.
 *
 * `getImageProps` is the documented way to learn the optimized `src`/`srcSet`
 * without rendering an `<Image>`; if it ever fails this stays a no-op, because a
 * preload is an optimisation and must never affect the quiz.
 */
export function illustrationPreloadFor(
  questionId: string,
): IllustrationPreload | null {
  const index = QUIZ_QUESTIONS.findIndex(
    (question) => question.id === questionId,
  );
  const nextQuestion = index === -1 ? undefined : QUIZ_QUESTIONS[index + 1];
  const src = nextQuestion
    ? questionIllustrationFor(nextQuestion.id)
    : undefined;
  if (!src) {
    return null;
  }

  try {
    const { props } = getImageProps({
      src,
      alt: "",
      fill: true,
      sizes: ILLUSTRATION_SIZES,
    });
    if (!props.src) {
      return null;
    }
    return {
      src: props.src,
      srcSet: props.srcSet ?? "",
      sizes: props.sizes ?? ILLUSTRATION_SIZES,
    };
  } catch {
    return null;
  }
}
