import QuizOption from "@/components/quiz/QuizOption";
import type { QuizQuestion } from "@/types/personality";

interface QuestionProps {
  question: QuizQuestion;
  selectedOptionId?: string;
  onSelect: (questionId: string, optionId: string) => void;
}

/** One screen of the quiz: the prompt plus its answer cards. */
export default function Question({
  question,
  selectedOptionId,
  onSelect,
}: QuestionProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-3 text-lg font-semibold leading-9 sm:text-xl">
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
  );
}
