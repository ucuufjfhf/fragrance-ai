import { toPersianDigits } from "@/lib/persian";

interface QuizOptionProps {
  /** Analytics/decoration hook — the question (or group) id. */
  name: string;
  optionId: string;
  label: string;
  /** 0-based position in its group, shown as a Persian digit. */
  index: number;
  selected: boolean;
  onSelect: (optionId: string) => void;
}

/**
 * A full-width answer row backed by a real <button>, in a number / label /
 * arrow grid (RTL: the number sits at inline-start, the arrow at inline-end).
 *
 * A button — not a radio card — is the Phase 1 editorial contract: every
 * option is directly actionable, natively keyboard-focusable, and announces
 * its state through `aria-pressed`. Selection values, scoring and matching
 * are untouched; only the control changes.
 *
 * The arrow points left: the forward direction in this RTL flow. Hover motion
 * (row shift, label underline, ink-darkening, arrow slide) lives in
 * `.quiz-option-row` in app/globals.css, gated to fine pointers.
 */
export default function QuizOption({
  name,
  optionId,
  label,
  index,
  selected,
  onSelect,
}: QuizOptionProps) {
  return (
    <button
      type="button"
      data-question-id={name}
      data-option-id={optionId}
      aria-pressed={selected}
      onClick={() => onSelect(optionId)}
      className="quiz-option-row"
    >
      <span aria-hidden="true" className="quiz-option-num">
        {toPersianDigits(index + 1)}
      </span>
      <span className="quiz-option-label">{label}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="quiz-option-arrow h-4 w-4"
      >
        <path d="M19 12H5m6-7-7 7 7 7" />
      </svg>
    </button>
  );
}
