import QuizOption from "@/components/quiz/QuizOption";
import type { QuizQuestion } from "@/types/personality";

interface QuestionProps {
  question: QuizQuestion;
  selectedOptionId?: string;
  onSelect: (questionId: string, optionId: string) => void;
}

/**
 * One screen of the quiz: the prompt plus its answer cards.
 *
 * The prompt is the approved question copy — unchanged. Only the framing (a
 * terracotta hairline, heading typeface) is restyled to match the homepage.
 */
export default function Question({
  question,
  selectedOptionId,
  onSelect,
}: QuestionProps) {
  return (
    <div className="flex flex-col gap-4">
      <span aria-hidden="true" className="h-px w-12 bg-accent/50" />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-heading text-lg font-semibold leading-9 text-foreground sm:text-xl">
          {question.prompt}
        </legend>
        <div className="flex flex-col gap-3">
          {question.options.map((option) => (
            <QuizOption
              key={option.id}
              name={question.id}
              optionId={option.id}
              label={option.label}
              selected={selectedOptionId === option.id}
              onSelect={(optionId) => onSelect(question.id, optionId)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
