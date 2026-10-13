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
 *
 * The selected marker is a hairline ring with a stroked tick (a path, not a
 * glyph), keeping the card free of emoji or icon fonts.
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
      className={`group flex cursor-pointer items-center gap-3.5 rounded-2xl border p-4 transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out focus-within:ring-2 focus-within:ring-accent/40 ${
        selected
          ? "border-accent bg-accent-soft shadow-[var(--shadow-card)]"
          : "border-border-soft bg-surface hover:-translate-y-0.5 hover:border-accent/40"
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
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
          selected
            ? "border-accent bg-accent text-background"
            : "border-border-soft bg-background text-transparent group-hover:border-accent/40"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      </span>
      <span className="text-[0.98rem] leading-8 text-foreground">{label}</span>
    </label>
  );
}
