import Image from "next/image";

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
 * Portrait per audience, matched by option ID (never by label text).
 *
 * Bundled public/ webp files, committed as downloaded. The repo's usual plain
 * <img> is deliberately NOT used here: the brief requires next/image with
 * proper sizes, so both cards get responsive sizing off the same rule.
 */
const AUDIENCE_PORTRAITS: Record<AudienceGender, string> = {
  MEN: "/audience/audience-man.webp",
  WOMEN: "/audience/audience-woman.webp",
};

/**
 * The audience step: one screen of its own between the intro and Q1.
 *
 * Two SMALL vertical photo cards side by side (RTL: the first option sits on
 * the right) — a confident pair, not billboards: the grid is capped
 * (240px on mobile, 640px on desktop) and centred, so the cards read at
 * ~110px / ~310px with the ambience visible around them. Scentbird-like but
 * with the label bar on TOP — the inverse the brief asks for — and the photo
 * filling the card below at ~3:4, cropped by object-cover. The whole card is
 * the option button: tapping anywhere selects and advances, exactly like the
 * old rows. The photos are decorative (the label carries the meaning), so
 * each img is alt="" and aria-hidden while the button's accessible name
 * comes from the label.
 *
 * Selection keeps the quiz's affordance language (accent border + ring),
 * adapted to the card. The title stays plain: the marker-wipe fires on the
 * intro and Q1/Q5/Q10 only. This screen is NOT part of the 10-question bank,
 * is never counted as a question, and its answer never reaches the
 * personality scorer (`lib/personality/scoring.ts`).
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
        <div className="mx-auto grid w-full max-w-[240px] grid-cols-2 gap-3 sm:max-w-[640px] sm:gap-4">
          {AUDIENCE_OPTIONS.map((option) => {
            const pressed = selected === option.id;
            return (
              <button
                key={option.id}
                type="button"
                data-question-id="audience"
                data-option-id={option.id}
                aria-pressed={pressed}
                onClick={() => onSelect(option.id)}
                className={`group flex flex-col overflow-hidden rounded-2xl border bg-surface text-start transition-[transform,border-color,box-shadow] duration-200 ease-out focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent/40 motion-reduce:transition-none ${
                  pressed
                    ? "border-accent shadow-[var(--shadow-card)] ring-2 ring-accent/50"
                    : "border-border-soft hover:border-accent/40"
                }`}
              >
                <span
                  className={`block px-3 py-2.5 text-center text-[0.95rem] font-medium leading-7 transition-colors duration-200 ${
                    pressed
                      ? "bg-accent-soft text-foreground"
                      : "bg-surface text-foreground group-hover:bg-accent-soft/60"
                  }`}
                >
                  {option.label}
                </span>
                <span
                  aria-hidden="true"
                  className="relative block aspect-[3/4] w-full overflow-hidden"
                >
                  <Image
                    src={AUDIENCE_PORTRAITS[option.id]}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="(max-width: 640px) 32vw, (max-width: 1023px) 40vw, 330px"
                    className="object-cover"
                  />
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
