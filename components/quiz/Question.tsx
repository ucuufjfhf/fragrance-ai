import QuizOption from "@/components/quiz/QuizOption";
import type { QuizQuestion } from "@/types/personality";

interface QuestionProps {
  question: QuizQuestion;
  selectedOptionId?: string;
  onSelect: (questionId: string, optionId: string) => void;
}

/** One screen of the quiz: the prompt plus its answer rows. */
export default function Question({
  question,
  selectedOptionId,
  onSelect,
}: QuestionProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-4 max-w-xl font-heading text-xl leading-10 text-foreground sm:text-2xl sm:leading-[3rem]">
        {question.prompt}
      </legend>
      <div className="flex flex-col rounded-[var(--radius-md)] border border-border-soft bg-surface/40">
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
  );
}
