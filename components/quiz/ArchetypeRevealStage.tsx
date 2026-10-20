"use client";

import { useId } from "react";

import { archetypeEmblemImageFor } from "@/components/archetype-emblems";
import type { ArchetypeId } from "@/types/personality";

/**
 * Motion contract for the archetype reveal stage: a fogged-mirror focus pull.
 *
 * Declared next to the component it animates — the same convention as
 * `ARCHETYPE_ICON_POP_CSS` in `components/archetype-icons.tsx` — so the stage's
 * motion ships with the stage instead of leaking into the global stylesheet.
 *
 * The metaphor is a mirror with fog on it: the emblem starts behind heavy fog
 * and comes into focus for the first time as the fog is wiped away. It runs
 * ~2.5 s, in one direction, with no bounce anywhere:
 *
 *   300–1600  the wipe: a soft light sweep travels across the emblem and the fog
 *             trails away behind it (`archetype-focus-wipe`, clip-path)
 *   700–1600  the warm glow blooms behind the emblem as it sharpens
 *   1500–2500 the name, then the explainer line, then the CTA rise gently
 *
 * ENTRY IS ALREADY FOGGED. Nothing sharp is ever painted first: the crisp layer
 * sits under the fog layer, and the fog layer's *base* state is the fogged one,
 * held by `animation-fill-mode: both` through its 300 ms delay. The stage is
 * therefore continuous with question 10 — you come straight into the fog.
 *
 * The wipe direction is RIGHT → LEFT, matching the reading direction: the fog is
 * removed from the right edge inward (`clip-path: inset(0 0% 0 0)` →
 * `inset(0 100% 0 0)`), so clarity trails the sweep exactly as it would trail a
 * hand. The sweep band and the clip share one duration, delay and easing, so the
 * wet edge stays locked to the light.
 *
 * Each element's base rule is its FINAL state, so `animation: none` composes the
 * finished stage — with one deliberate exception: the fog layer's base rule is
 * the wiped state (`inset(0 100% 0 0)`), because a static run must show a sharp
 * emblem, not a blurred one. The sweep strip is likewise transparent at rest.
 *
 * The reduced-motion bypass is written LAST on purpose: this block is emitted by
 * the component itself, after the stylesheet, so nothing later can outrank it.
 * With `animation: none` the stage renders sharp immediately — no fog, no sweep,
 * no stagger.
 */
export const ARCHETYPE_REVEAL_CSS = `
@keyframes archetype-focus-wipe {
  from { clip-path: inset(0 0% 0 0); }
  to { clip-path: inset(0 100% 0 0); }
}
@keyframes archetype-focus-sweep {
  from { opacity: 0; transform: translateX(117%) skewX(-8deg); }
  10% { opacity: 1; }
  90% { opacity: 1; }
  to { opacity: 0; transform: translateX(-50%) skewX(-8deg); }
}
@keyframes archetype-focus-glow {
  from { opacity: 0; transform: scale(0.82); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes archetype-focus-line {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
.archetype-focus-fog {
  background: color-mix(in srgb, var(--accent) 12%, white);
  filter: blur(22px) saturate(0.68) brightness(1.08);
  clip-path: inset(0 100% 0 0);
  animation: archetype-focus-wipe 1300ms cubic-bezier(0.22, 1, 0.36, 1) 300ms both;
}
.archetype-focus-fog::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, white 60%, var(--accent)) 0%,
    color-mix(in srgb, white 82%, var(--accent)) 58%,
    transparent 100%
  );
}
.archetype-focus-sweep {
  opacity: 0;
  animation: archetype-focus-sweep 1300ms cubic-bezier(0.22, 1, 0.36, 1) 300ms both;
}
.archetype-focus-glow {
  animation: archetype-focus-glow 900ms cubic-bezier(0.22, 1, 0.36, 1) 700ms both;
}
.archetype-focus-line { animation: archetype-focus-line 600ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .archetype-focus-fog,
  .archetype-focus-sweep,
  .archetype-focus-glow,
  .archetype-focus-line { animation: none; }
}
`;

/** Inline delays for the three text steps of the cascade (ms). */
const NAME_DELAY_MS = "1500ms";
const EXPLAINER_DELAY_MS = "1700ms";
const CTA_DELAY_MS = "1900ms";

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
 * The result phase used to open with a quiet circular seal; it now opens on the
 * fragrance identity coming into focus for the first time — the emblem behind
 * fog on a mirror, wiped clear by a light sweep, with the name, the
 * selection-basis line and the CTA rising gently behind it.
 *
 * There is deliberately no copy other than the archetype name, the explainer
 * line and the CTA: the visual carries the meaning, so nothing claims
 * "unlocked" or "achieved".
 *
 * This is a STEP in the quiz flow, not a modal: it has no overlay, no backdrop,
 * no dismissal-by-outside-click, no focus trap and no scroll lock. The CTA is
 * the single way forward and simply continues the EXISTING flow (the fragrance
 * profile card, whose own CTA opens the optional refinement step and then
 * `/result`) — no route, state-machine step or engine call changes here.
 *
 * The heading carries the archetype name, and the emblem is a `role="img"`
 * labelled with it too — the same accessible-name contract the profile card's
 * seal already uses. The fog, the sweep and the glow are decoration: the glass
 * around the emblem is `aria-hidden`.
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

      {/* Warm radial glow, blooming behind the emblem as the mirror clears. The
          positioning lives on this wrapper and the animation on the inner
          element, so the two never fight over `transform`. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2"
      >
        <span
          className="archetype-focus-glow block h-full w-full rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 32%, white), transparent)",
          }}
        />
      </span>

      {/* --- the mirror ---
          The emblem at full size. Decorative: the heading below carries the
          accessible name, so the picture is not announced twice. */}
      <span
        role="img"
        aria-label={label}
        className="relative flex h-72 w-72 items-center justify-center rounded-full border border-accent/30 bg-surface-2 shadow-[var(--shadow-soft)] sm:h-80 sm:w-80"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 -m-4 rounded-full border border-accent/20"
        />

        {/* The glass and everything on it. */}
        <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-full">
          {/* Crystal layer — the emblem itself, always sharp. The fog above it
              is what hides it, so this layer never needs an entrance of its
              own: nothing sharp is ever painted over a fresh screen first. */}
          {/* Bundled public/ asset, not merchant data: a plain <img> keeps the
              exact file and its 1:1 ratio, with no loader in between. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={emblemSrc}
            alt=""
            width={1600}
            height={1600}
            className="h-full w-full object-cover"
          />

          {/* Fogged layer — the same emblem blurred, desaturated and misted, on
              an opaque milky bed so the blur's soft rim reads as fog on glass
              rather than a hole. It is wiped away from the right. */}
          <span className="archetype-focus-fog absolute inset-0 block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={emblemSrc}
              alt=""
              width={1600}
              height={1600}
              className="h-full w-full object-cover"
            />
          </span>

          {/* The soft light sweep, straddling the wet edge: a wide band whose
              centre tracks the fog's trailing edge across the mirror. */}
          <span
            aria-hidden="true"
            className="archetype-focus-sweep pointer-events-none absolute inset-y-0 left-0 w-3/5"
            style={{
              background:
                "linear-gradient(100deg, rgba(255,255,255,0) 4%, rgba(255,251,244,0.6) 46%, rgba(255,255,255,0) 96%)",
            }}
          />
        </span>
      </span>

      <h1
        id={headingId}
        className="archetype-focus-line max-w-md font-heading text-3xl font-bold leading-tight text-foreground sm:text-4xl"
        style={{ animationDelay: NAME_DELAY_MS }}
      >
        {label}
      </h1>

      <p
        className="archetype-focus-line max-w-md text-xs leading-7 text-muted"
        style={{ animationDelay: EXPLAINER_DELAY_MS }}
      >
        {selectionBasis}
      </p>

      {/* The entrance animation sits on this wrapper, not on the button: a
          finished animation would otherwise outrank the button's own hover
          state. The button itself only shifts fill colour. */}
      <div
        className="archetype-focus-line flex w-full justify-center"
        style={{ animationDelay: CTA_DELAY_MS }}
      >
        <button
          type="button"
          onClick={onContinue}
          className="btn-primary flex min-h-12 w-full max-w-xs items-center justify-center px-6 font-medium text-background"
        >
          دیدن نتایج
        </button>
      </div>
    </section>
  );
}
