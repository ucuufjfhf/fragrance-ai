"use client";

import { useId } from "react";

import { archetypeEmblemImageFor } from "@/components/archetype-emblems";
import type { ArchetypeId } from "@/types/personality";

/**
 * Motion contract for the archetype reveal stage.
 *
 * Declared next to the component it animates — the same convention as
 * `ARCHETYPE_ICON_POP_CSS` in `components/archetype-icons.tsx` — so the stage's
 * motion ships with the stage instead of leaking into the global stylesheet.
 *
 * The cascade is deliberately short and restrained (roughly 860 ms end to end)
 * and reads in one direction: the glow blooms behind the emblem, the emblem
 * settles from 0.8 to 1, then name → explainer → CTA rise in turn. Every step
 * uses the same ease-out curve, so the whole entrance decelerates together.
 *
 * The schedule is: glow 0–700, emblem 120–680, name 240–660, explainer
 * 360–780, CTA 460–880 — 880 ms end to end, inside the 600–900 ms budget.
 *
 * The per-element delays live inline (`animationDelay`) while the shared
 * animation lives here; the fill mode is `both` so an element holds its hidden
 * `from` state during its delay rather than flashing in at full opacity first.
 *
 * The reduced-motion bypass is written LAST on purpose: this block is emitted by
 * the component itself, after the stylesheet, so nothing later can outrank it.
 * With `animation: none` every element simply renders in its final state — a
 * static appear, with no inline `animationDelay` able to reintroduce motion.
 */
export const ARCHETYPE_REVEAL_CSS = `
@keyframes archetype-stage-glow {
  from { opacity: 0; transform: scale(0.74); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes archetype-stage-emblem {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes archetype-stage-line {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.archetype-stage-glow { animation: archetype-stage-glow 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.archetype-stage-emblem { animation: archetype-stage-emblem 560ms cubic-bezier(0.22, 1, 0.36, 1) 120ms both; }
.archetype-stage-line { animation: archetype-stage-line 420ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .archetype-stage-glow,
  .archetype-stage-emblem,
  .archetype-stage-line { animation: none; }
}
`;

/** Inline delays for the three text steps of the cascade (ms). */
const NAME_DELAY_MS = "240ms";
const EXPLAINER_DELAY_MS = "360ms";
const CTA_DELAY_MS = "460ms";

interface ArchetypeRevealStageProps {
  /** The archetype whose emblem is revealed — a pure id lookup, never a score. */
  archetypeId: ArchetypeId;
  /** Persian archetype name — the stage's heading and accessible name. */
  label: string;
  /** The selection-basis line («...همهٔ ۹ محور...»), same copy as the card. */
  selectionBasis: string;
  /**
   * Advances to the next step of the existing flow. The stage never navigates,
   * scores or decides anything itself.
   */
  onContinue: () => void;
}

/**
 * The archetype reveal, as a full-screen stage (Phase E).
 *
 * The result phase used to open with a quiet circular seal; it now opens with
 * the archetype's emblem large, centered in its own full-height step, staggered
 * in as one short reveal. This is a STEP in the quiz flow, not a modal: it has
 * no overlay, no backdrop, no dismissal-by-outside-click, no focus trap and no
 * scroll lock. The CTA is the single way forward and simply continues the
 * EXISTING flow (the fragrance profile card, whose own CTA opens the optional
 * refinement step and then `/result`) — no route, state-machine step or engine
 * call changes here.
 *
 * The heading carries the archetype name, and the emblem is a `role="img"`
 * labelled with it too — the same accessible-name contract the profile card's
 * seal already uses.
 *
 * Presentational only. The archetype id, label and explainer copy are passed in
 * by the caller; nothing is computed, scored or fetched.
 */
export default function ArchetypeRevealStage({
  archetypeId,
  label,
  selectionBasis,
  onContinue,
}: ArchetypeRevealStageProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="archetype-stage relative flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-hidden px-4 py-14 text-center"
    >
      {/* Motion contract — reduced-motion bypass included. */}
      <style>{ARCHETYPE_REVEAL_CSS}</style>

      {/* Soft radial glow that blooms behind the emblem. The positioning lives
          on this wrapper and the animation on the inner element, so the two
          never fight over `transform`. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2"
      >
        <span
          className="archetype-stage-glow block h-full w-full rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 32%, white), transparent)",
          }}
        />
      </span>

      {/* The emblem, large. Decorative: the heading below carries the
          accessible name, so the picture is not announced twice. */}
      <span
        role="img"
        aria-label={label}
        className="archetype-stage-emblem relative flex h-72 w-72 items-center justify-center rounded-full border border-accent/30 bg-surface-2 shadow-[var(--shadow-soft)] sm:h-80 sm:w-80"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 -m-4 rounded-full border border-accent/20"
        />
        <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-full">
          {/* A bundled public/ asset, not merchant data: plain <img> keeps the
              exact file and its 1:1 ratio, with no loader in between. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={archetypeEmblemImageFor(archetypeId)}
            alt=""
            width={1600}
            height={1600}
            className="h-full w-full object-cover"
          />
        </span>
      </span>

      <h1
        id={headingId}
        className="archetype-stage-line max-w-md font-heading text-3xl font-bold leading-tight text-foreground sm:text-4xl"
        style={{ animationDelay: NAME_DELAY_MS }}
      >
        {label}
      </h1>

      <p
        className="archetype-stage-line max-w-md text-xs leading-7 text-muted"
        style={{ animationDelay: EXPLAINER_DELAY_MS }}
      >
        {selectionBasis}
      </p>

      {/* The animation sits on this wrapper, never on the button: `.btn-primary`
          owns the button's own transform (its hover lift), and a finished
          animation would otherwise outrank it. */}
      <div
        className="archetype-stage-line flex w-full justify-center"
        style={{ animationDelay: CTA_DELAY_MS }}
      >
        <button
          type="button"
          onClick={onContinue}
          className="btn-primary flex min-h-12 w-full max-w-xs items-center justify-center rounded-2xl bg-accent px-6 font-medium text-background"
        >
          دیدن نتایج
        </button>
      </div>
    </section>
  );
}
