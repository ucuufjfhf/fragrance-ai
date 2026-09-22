interface QuizOptionProps {
  /** Radio group name — the question id. */
  name: string;
  optionId: string;
  label: string;
  selected: boolean;
  onSelect: (optionId: string) => void;
}

/**
 * A full-width answer card backed by a real radio input, so keyboard support
 * (arrow keys, space) and screen-reader semantics come for free while the visual
 * design stays card-like.
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
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-accent/60 ${
        selected
          ? "border-accent bg-accent-soft"
          : "border-border-soft bg-surface-2 hover:border-accent/50"
      }`}
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
        className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.7rem] font-bold ${
          selected
            ? "border-accent bg-accent text-background"
            : "border-border-soft text-transparent"
        }`}
      >
        ✓
      </span>
      <span className="text-[0.98rem] leading-8">{label}</span>
    </label>
  );
}
