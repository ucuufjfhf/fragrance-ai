import QuizOption from "@/components/quiz/QuizOption";
import {
  AUDIENCE_OPTIONS,
  AUDIENCE_QUESTION,
  type AudienceGender,
} from "@/lib/audience";

interface AudienceStepProps {
  /** Current choice, when the shopper navigated back from Q1. */
  selected?: AudienceGender | null;
  onSelect: (audience: AudienceGender) => void;
}

/**
 * The audience step: one screen of its own between the intro and Q1.
 *
 * Phase 1 — Gilded Editorial: the same asymmetric composition as the question
 * screens (start-aligned display title, full-width button rows) — with a
 * plain title: the marker-wipe fires on the intro and Q1/Q5/Q10 only, so this
 * screen carries no highlight. It is NOT part of the 10-question bank, is
 * never counted as a question, and its answer never reaches the personality
 * scorer (`lib/personality/scoring.ts`).
 */
export default function AudienceStep({
  selected,
  onSelect,
}: AudienceStepProps) {
  return (
    <div className="flex flex-col gap-8 py-2 sm:gap-10 sm:py-4">
      <span aria-hidden="true" className="h-px w-12 bg-accent/50" />
      {/* See Question.tsx: the breathing room is the legend's margin —
          fieldset gap never reaches a rendered <legend>. */}
      <fieldset className="flex min-w-0 flex-col gap-6">
        <legend className="mb-12 flex flex-col gap-3 p-0">
          <span className="font-display text-[1.7rem] font-semibold leading-[1.0] tracking-[-0.01em] text-foreground sm:text-4xl">
            {AUDIENCE_QUESTION}
          </span>
        </legend>
        <div className="flex flex-col gap-3">
          {AUDIENCE_OPTIONS.map((option, optionIndex) => (
            <QuizOption
              key={option.id}
              name="audience"
              optionId={option.id}
              label={option.label}
              index={optionIndex}
              selected={selected === option.id}
              onSelect={() => onSelect(option.id)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
