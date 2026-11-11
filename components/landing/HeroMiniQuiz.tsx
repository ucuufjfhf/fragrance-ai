import Link from "next/link";

import {
  MINI_QUIZ_PARAM,
  MINI_QUIZ_QUESTION_ID,
} from "@/lib/personality/quiz-flow";
import { getQuestionById } from "@/lib/personality/questions";

/**
 * Batch 38 — the first question, answered in the hero.
 *
 * The prompt, its options, their labels and their order all come from the
 * question bank: nothing is retyped here, so a change to Q1 in
 * `lib/personality/questions.ts` shows up on the homepage for free (and the
 * three labels can never drift from the quiz's own rows).
 *
 * Each option is a plain link to /quiz carrying its id (`?q1=<optionId>`).
 * That is the carry: a real navigation the server can read, so /quiz resumes
 * with Q1 answered and survives a refresh — no storage permission, no state
 * that outlives the address bar. The hero itself records nothing and fires no
 * analytics; the quiz's single QUIZ_STARTED fires on the arrival instead.
 *
 * It stays a server component: three anchors cost no client JavaScript, and
 * the existing «شروع آزمون» button below remains the no-answer path.
 */
export default function HeroMiniQuiz() {
  const question = getQuestionById(MINI_QUIZ_QUESTION_ID);

  // The mini-quiz is optional chrome: if the bank ever loses Q1 the hero
  // simply renders without it instead of crashing the front door.
  if (!question) {
    return null;
  }

  const promptId = "hero-mini-quiz-prompt";

  return (
    <div
      role="group"
      aria-labelledby={promptId}
      className="flex w-full max-w-xl flex-col gap-3"
    >
      <p id={promptId} className="text-sm font-semibold leading-7 text-foreground">
        {question.prompt}
      </p>
      <ul className="flex flex-col gap-2">
        {question.options.map((option) => (
          <li key={option.id}>
            <Link
              href={`/quiz?${MINI_QUIZ_PARAM}=${encodeURIComponent(option.id)}`}
              data-question-id={question.id}
              data-option-id={option.id}
              className="group flex items-center justify-between gap-3 rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm leading-7 text-foreground transition-colors duration-200 hover:border-accent/40 hover:bg-accent-soft/50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent/40 motion-reduce:transition-none"
            >
              <span>{option.label}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 shrink-0 text-accent"
              >
                <path d="M19 12H5m6-7-7 7 7 7" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
