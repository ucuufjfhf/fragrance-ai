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
 * It reuses the existing `QuizOption` radio cards, so it looks and behaves like
 * every other quiz screen without introducing a second visual system. It is NOT
 * part of the 10-question bank, is never counted as a question, and its answer
 * never reaches the personality scorer (`lib/personality/scoring.ts`).
 */
export default function AudienceStep({
  selected,
  onSelect,
}: AudienceStepProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-3 text-lg font-semibold leading-9 sm:text-xl">
        {AUDIENCE_QUESTION}
      </legend>
      <div className="flex flex-col gap-3">
        {AUDIENCE_OPTIONS.map((option) => (
          <QuizOption
            key={option.id}
            name="audience"
            optionId={option.id}
            label={option.label}
            selected={selected === option.id}
            onSelect={() => onSelect(option.id)}
          />
        ))}
      </div>
    </fieldset>
  );
}
