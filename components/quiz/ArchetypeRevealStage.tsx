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
 * The entrance is an ACHIEVEMENT UNLOCK in two beats, 600 ms end to end:
 *
 *   Beat 1 — the unlock header: the small medallion + the «آرکتایپ شما باز شد!»
 *     badge snap in, and a light sweeps once across the badge (the "unlocked"
 *     flourish).
 *   Beat 2 — the reveal settles: the glow blooms, the emblem grows to full size,
 *     then name → explainer → CTA stagger in tight.
 *
 * Schedule: header 0–220, shine 60–400, glow 100–520, emblem 200–540,
 * name 280–500, explainer 340–560, CTA 380–600.
 *
 * The punch comes from `cubic-bezier(0.34, 1.3, 0.64, 1)` — an ease-out that
 * overshoots slightly — on the three unlock moments (header, glow, emblem). The
 * three text lines use a clean ease-out instead: they carry the information, so
 * they land rather than bounce. Luxury stays in the restraint: one sweep, one
 * bloom, no particles, no second accent colour.
 *
 * The per-element delays live inline (`animationDelay`) while the shared
 * animation lives here; the fill mode is `both` so an element holds its hidden
 * `from` state during its delay rather than flashing in at full opacity first.
 *
 * The sweep strip sits at `opacity: 0` in its base rule, so `animation: none`
 * below leaves it invisible rather than stranded mid-badge.
 *
 * The reduced-motion bypass is written LAST on purpose: this block is emitted by
 * the component itself, after the stylesheet, so nothing later can outrank it.
 * With `animation: none` every element renders in its final state — a static
 * appear, with no inline `animationDelay` able to reintroduce motion.
 */
export const ARCHETYPE_REVEAL_CSS = `
@keyframes archetype-unlock-header {
  from { opacity: 0; transform: scale(0.86) translateY(-6px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes archetype-unlock-shine {
  0% { opacity: 0; transform: translateX(-160%) skewX(-14deg); }
  12% { opacity: 1; }
  88% { opacity: 1; }
  100% { opacity: 0; transform: translateX(360%) skewX(-14deg); }
}
@keyframes archetype-unlock-glow {
  from { opacity: 0; transform: scale(0.7); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes archetype-unlock-emblem {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes archetype-unlock-line {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.archetype-unlock-header {
  animation: archetype-unlock-header 220ms cubic-bezier(0.34, 1.3, 0.64, 1) both;
}
.archetype-unlock-shine {
  opacity: 0;
  animation: archetype-unlock-shine 340ms ease-out 60ms both;
}
.archetype-unlock-glow {
  animation: archetype-unlock-glow 420ms cubic-bezier(0.34, 1.3, 0.64, 1) 100ms both;
}
.archetype-unlock-emblem {
  animation: archetype-unlock-emblem 340ms cubic-bezier(0.34, 1.3, 0.64, 1) 200ms both;
}
.archetype-unlock-line { animation: archetype-unlock-line 220ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .archetype-unlock-header,
  .archetype-unlock-shine,
  .archetype-unlock-glow,
  .archetype-unlock-emblem,
  .archetype-unlock-line { animation: none; }
}
`;

/**
 * The unlock badge, in the shopper's words: polite second person («شما»), warm
 * and celebratory but plain — it says what just happened, nothing more.
 */
export const UNLOCK_LABEL = "آرکتایپ شما باز شد!";

/** Inline delays for the three text steps of the cascade (ms). */
const NAME_DELAY_MS = "280ms";
const EXPLAINER_DELAY_MS = "340ms";
const CTA_DELAY_MS = "380ms";

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
 * the archetype's emblem large, centered in its own full-height step, arriving
 * as an achievement unlock: the «آرکتایپ شما باز شد!» badge with a single shine
 * sweep, then the emblem growing to full size with the name, the selection-basis
 * line and the CTA behind it.
 *
 * This is a STEP in the quiz flow, not a modal: it has no overlay, no backdrop,
 * no dismissal-by-outside-click, no focus trap and no scroll lock. The CTA is
 * the single way forward and simply continues the EXISTING flow (the fragrance
 * profile card, whose own CTA opens the optional refinement step and then
 * `/result`) — no route, state-machine step or engine call changes here.
 *
 * The heading carries the archetype name, and the emblem is a `role="img"`
 * labelled with it too — the same accessible-name contract the profile card's
 * seal already uses. The unlock badge and the sweep are decoration around that
 * heading: the badge text is real copy, the medallion and the sweep are
 * `aria-hidden`.
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
  const emblemSrc = archetypeEmblemImageFor(archetypeId);

  return (
    <section
      aria-labelledby={headingId}
      className="archetype-stage relative flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-hidden px-4 py-14 text-center"
    >
      {/* Motion contract — reduced-motion bypass included. */}
      <style>{ARCHETYPE_REVEAL_CSS}</style>

      {/* Soft radial glow, blooming behind the emblem as beat 2 settles. The
          positioning lives on this wrapper and the animation on the inner
          element, so the two never fight over `transform`. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2"
      >
        <span
          className="archetype-unlock-glow block h-full w-full rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 32%, white), transparent)",
          }}
        />
      </span>

      {/* --- beat 1: the unlock header ---
          The small medallion is decorative — it is the same emblem as the hero
          one, just the "key" that turns first — and the badge carries the copy. */}
      <div className="archetype-unlock-header relative flex items-center gap-3">
        <span
          aria-hidden="true"
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-surface-2 shadow-[var(--shadow-card)]"
        >
          <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={emblemSrc}
              alt=""
              width={1600}
              height={1600}
              className="h-full w-full object-cover"
            />
          </span>
        </span>

        {/* `overflow-hidden` clips the sweep to the badge; the strip itself is
            decorative and starts invisible (see `archetype-unlock-shine`). */}
        <span className="relative overflow-hidden rounded-full border border-accent/30 bg-accent-soft px-4 py-1.5 font-heading text-sm text-accent">
          <span
            aria-hidden="true"
            className="archetype-unlock-shine pointer-events-none absolute inset-y-0 left-0 w-1/3"
            style={{
              background:
                "linear-gradient(100deg, transparent 15%, color-mix(in srgb, var(--accent) 30%, white) 50%, transparent 85%)",
            }}
          />
          {UNLOCK_LABEL}
        </span>
      </div>

      {/* --- beat 2: the reveal settles ---
          The emblem at full size. Decorative: the heading below carries the
          accessible name, so the picture is not announced twice. */}
      <span
        role="img"
        aria-label={label}
        className="archetype-unlock-emblem relative flex h-72 w-72 items-center justify-center rounded-full border border-accent/30 bg-surface-2 shadow-[var(--shadow-soft)] sm:h-80 sm:w-80"
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
            src={emblemSrc}
            alt=""
            width={1600}
            height={1600}
            className="h-full w-full object-cover"
          />
        </span>
      </span>

      <h1
        id={headingId}
        className="archetype-unlock-line max-w-md font-heading text-3xl font-bold leading-tight text-foreground sm:text-4xl"
        style={{ animationDelay: NAME_DELAY_MS }}
      >
        {label}
      </h1>

      <p
        className="archetype-unlock-line max-w-md text-xs leading-7 text-muted"
        style={{ animationDelay: EXPLAINER_DELAY_MS }}
      >
        {selectionBasis}
      </p>

      {/* The animation sits on this wrapper, never on the button: `.btn-primary`
          owns the button's own transform (its hover lift), and a finished
          animation would otherwise outrank it. */}
      <div
        className="archetype-unlock-line flex w-full justify-center"
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
