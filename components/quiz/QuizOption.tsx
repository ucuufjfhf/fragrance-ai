import { CheckMark } from "@/components/ui-icons";

interface QuizOptionProps {
  /** Radio group name — the question id. */
  name: string;
  optionId: string;
  label: string;
  selected: boolean;
  onSelect: (optionId: string) => void;
}

/**
 * A full-width answer row backed by a real radio input, so keyboard support
 * (arrow keys, space) and screen-reader semantics come for free while the
 * visual design stays editorial.
 *
 * The rows are hairline-separated list items rather than a stack of identical
 * cards: on the night-sky quiz the selected answer lights up in champagne, and
 * the same treatment works unchanged inside the light widget.
 */
export default function QuizOption({
  name,
  optionId,
  label,
  selected,
  onSelect,
}: QuizOptionProps) {
  return (
    <label
      className={`group flex cursor-pointer items-start gap-3 border-b border-border-soft px-3 py-4 text-foreground transition-colors first:border-t ${
        selected ? "bg-champagne/12" : "hover:bg-champagne/6"
      } focus-within:bg-champagne/10 focus-within:ring-1 focus-within:ring-champagne/50`}
    >
      <input
        type="radio"
        name={name}
        value={optionId}
        checked={selected}
        onChange={() => onSelect(optionId)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          selected ? "border-champagne bg-champagne text-night" : "border-border-soft text-transparent"
        }`}
      >
        <CheckMark className="h-3 w-3" />
      </span>
      <span className="text-[0.98rem] leading-8 text-foreground">{label}</span>
    </label>
  );
}
