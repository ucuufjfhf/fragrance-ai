import Image from "next/image";

import MarkerWipe from "@/components/quiz/MarkerWipe";
import QuizOption from "@/components/quiz/QuizOption";
import { toPersianDigits } from "@/lib/persian";
import {
  questionPhotoFocusFor,
  questionPhotoFor,
} from "@/lib/quiz/question-photos";
import {
  HIGHLIGHTED_QUESTION_IDS,
  QUESTION_HIGHLIGHTS,
  splitHighlighted,
} from "@/lib/personality/question-highlights";
import type { QuizQuestion } from "@/types/personality";

interface QuestionProps {
  question: QuizQuestion;
  selectedOptionId?: string;
  onSelect: (questionId: string, optionId: string) => void;
}

/**
 * One screen of the quiz: the prompt plus its answer rows.
 *
 * Phase 1 — Gilded Editorial: an asymmetric, start-aligned composition with
 * generous whitespace instead of the old centred card stack. The prompt is
 * the approved question copy — byte-identical, only its emotional core is
 * wrapped in a marker-wipe highlight on the allowlisted screens only (Q1/Q5/
 * Q10 — a signature stays rare) — set in the display face at tight leading.
 * The prompt, the option values and everything downstream (scoring,
 * matching, /result) are untouched.
 */
export default function Question({
  question,
  selectedOptionId,
  onSelect,
}: QuestionProps) {
  const highlight = HIGHLIGHTED_QUESTION_IDS.has(question.id)
    ? splitHighlighted(question.prompt, QUESTION_HIGHLIGHTS[question.id])
    : null;
  const photo = questionPhotoFor(question.id);
  const photoFocus = questionPhotoFocusFor(question.id);

  return (
    <div className="flex flex-col gap-8 py-2 sm:gap-10 sm:py-4">
      <span aria-hidden="true" className="h-px w-12 bg-accent/50" />
      {/* Atmosphere band: one fixed editorial photo per question screen,
          above the question text. Decorative (the prompt carries the
          meaning), so the img is alt="" and aria-hidden while the options
          stay text rows. The fixed aspect ratio keeps the rendered height
          identical on every question, so the layout never jumps; keyed by
          question id so the fade replays on each screen change. */}
      {photo ? (
        <figure
          key={question.id}
          aria-hidden="true"
          className="quiz-photo-band relative block aspect-[16/10] w-full overflow-hidden rounded-2xl sm:aspect-[21/9]"
        >
          <Image
            src={photo}
            alt=""
            aria-hidden="true"
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
            style={{ objectPosition: photoFocus }}
          />
        </figure>
      ) : null}
      {/* The 48px title-to-options room lives on the legend's margin, not on
          the fieldset's gap: a rendered <legend> is laid out specially and
          flex gap never reaches it (measured 0px in Chrome), while
          margin-bottom lands exactly. */}
      <fieldset className="flex min-w-0 flex-col gap-6">
        <legend className="mb-12 flex flex-col gap-3 p-0">
          <span className="quiz-editorial-kicker">
            سؤال {toPersianDigits(question.order)}
          </span>
          <span className="font-display text-[1.7rem] font-semibold leading-[1.0] tracking-[-0.01em] text-foreground sm:text-4xl">
            {highlight ? (
              <>
                {highlight[0]}
                <MarkerWipe replayKey={question.id}>
                  {highlight[1]}
                </MarkerWipe>
                {highlight[2]}
              </>
            ) : (
              question.prompt
            )}
          </span>
        </legend>
        <div className="flex flex-col gap-3">
          {question.options.map((option, optionIndex) => (
            <QuizOption
              key={option.id}
              name={question.id}
              optionId={option.id}
              label={option.label}
              index={optionIndex}
              selected={selectedOptionId === option.id}
              onSelect={(optionId) => onSelect(question.id, optionId)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
