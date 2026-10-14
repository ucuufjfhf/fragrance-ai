import type { CSSProperties } from "react";

/**
 * Quiz ambience, act 3 — the abstract spray.
 *
 * Acts 1 and 2 gave the quiz weather and a read-out of progress. This is the
 * third thing a real perfume counter has: the air itself, moving on its own. Two
 * layers, both purely ambient — nothing here is tied to an answer, a click or
 * the flow (that is the ink blooms' job):
 *
 *  1. spray-mist plumes — a soft mist that puffs from a point like a fine spray,
 *     drifts, and dissipates over ~4.5s, then repeats on its own cycle. Three
 *     nodes, so at most three are ever alive.
 *  2. golden motes — 48 tiny warm specks drifting slowly upward with a gentle
 *     sway and a twinkle, like dust in low sunlight.
 *
 * Placement is deliberate rather than scattered: the quiz card is opaque and
 * covers the centre of every screen, so a plume (or a mote) whose CORE sits
 * behind it is simply not there. The origins below therefore live in the air the
 * card leaves free — the margin above the card (both viewports), the side bands
 * (wide viewports) and the strip below it — and only their soft outer edges pass
 * behind the card as they expand. Measured, not assumed: at 1440×900 two plumes
 * are fully free and one is 73% free; at 390×844 the two top plumes keep their
 * cores in the free strip under the header, and the mote field is split between
 * the side bands (fully visible when there is room) and the middle columns, whose
 * rises carry them through that same strip.
 *
 * Painting order, back to front, as rendered on the quiz route:
 *
 *   bokeh orbs (QuizAmbience, deep) → washes (QuizAmbience) → ink blooms
 *     → clearing fog (QuizAtmosphere) → mist plumes → golden motes   ← this file
 *     → quiz cards/content → grain (QuizAmbience, z-50)
 *     → answer pulse (QuizAtmosphere, z-60)
 *
 * The two layers here are `fixed` `-z-10` siblings declared immediately after
 * `QuizAtmosphere`, so DOM order (same z-index) paints them above the fog and
 * still behind the cards. Nothing can land on the question text: the cards are
 * opaque, so the motes and plumes are only ever visible in the air AROUND them.
 *
 * Purely decorative and cheap: no canvas, no JavaScript loop, no timers, no
 * images, no dependencies. Which is also how "randomized" is done here without
 * JS — each node carries its own position, cycle length and phase, so the
 * composite only repeats after minutes, while the motes drift on 16–28s loops.
 *
 * Plume timing is evenly spaced on purpose, and by simulation rather than by
 * feel: three equal 12s cycles phased 0s / −4s / −8s start a puff every 4s —
 * the livelier cadence the brief now asks for (~3.5–4s), safely tighter than
 * the 5s of act 3's first pass. Unequal periods (the obvious way to look
 * "organic") drift out of phase and open real lulls, so all three nodes share
 * one cycle length and differ only in phase. Both layers set `aria-hidden` and
 * `pointer-events: none`, animate only `transform`/`opacity`, carry no filters,
 * and hold their node caps by construction (`MAX_PLUMES`, `MAX_MOTES`) — see the
 * CSS in `app/globals.css`.
 *
 * Colours come from the existing tokens only (`--accent` and `white`, exactly
 * like act 1's washes and the results-page particles), so no new palette enters
 * the project. Under `prefers-reduced-motion` the plumes hold a faint static
 * state and the motes are removed entirely.
 */

/** Hard cap: three plumes alive at most, one per configured node. */
export const MAX_PLUMES = 3;

/** Hard cap: the mote field is 48 specks, no more. */
export const MAX_MOTES = 48;

/** Motes are specks: 2–5px, so they can never become a shape. */
export const MOTE_MIN_SIZE_PX = 2;
export const MOTE_MAX_SIZE_PX = 5;

interface Plume {
  /** Origin, % of the viewport. */
  left: number;
  top: number;
  /** Diameter at rest, px. */
  size: number;
  /**
   * Full puff cycle, s. All three nodes share it so their starts stay evenly
   * spaced (see PLUMES), and 38% of it is the puff itself — 4.56s here.
   */
  duration: number;
  /** Start offset, s (negative = begin mid-cycle). */
  delay: number;
  /** How far the mist drifts as it dissipates, px. */
  driftX: number;
  driftY: number;
}

/**
 * Three plume origins, placed in the free air around the card: two in the band
 * above it (visible on every viewport, including phones) and one in the left
 * margin (visible wherever the card is narrower than the window). None of them
 * sits near the footer band, so no mist ever forms behind the footer copy.
 *
 * Phases 0 / −4 / −8 over one 12s cycle ⇒ a puff every 4s (see the doc above).
 */
const PLUMES: readonly Plume[] = [
  { left: 26, top: 9, size: 340, duration: 12, delay: 0, driftX: 24, driftY: 18 },
  { left: 74, top: 8, size: 380, duration: 12, delay: -4, driftX: -28, driftY: 22 },
  { left: 10, top: 44, size: 360, duration: 12, delay: -8, driftX: 30, driftY: -26 },
];

interface Mote {
  /** Start position, % of the viewport; the drift carries it upward from there. */
  left: number;
  top: number;
  /** Diameter, px (2–5). */
  size: number;
  /** Drift loop, s. */
  duration: number;
  /** Start offset, s (negative = begin mid-loop). */
  delay: number;
  /** Twinkle intensity, drives the keyframe opacity via `--mote-opacity`. */
  opacity: number;
}

/**
 * 48 hand-placed motes: spread across the field, every loop phase distinct.
 *
 * Three groups, chosen for the air each viewport actually leaves free — a mote
 * whose CORE is behind the opaque card does not exist, so placement is the whole
 * of the effect here (measured, not assumed):
 *
 *  · edge columns (x ≤ 3% / x ≥ 97%) — the 16px strips beside the card on a
 *    phone, and the outer margins on a wide screen. Visible for the whole climb
 *    on both;
 *  · side bands (x 9–26% / 74–91%) — the wide viewports' margins;
 *  · middle columns (x 34–66%, starting at 8–26%) — behind the card, except
 *    that their 134px climb carries them up through the free band under the
 *    header, which is the one strip of air a phone has as well.
 *
 * Nothing starts below 74%, so the footer band stays clear of dust. Every pair
 * of (left, top) is unique, and the group lefts never overlap, so no two motes
 * ever share a start — the density comes from count, not from stacking.
 */
const MOTES: readonly Mote[] = [
  { left: 1, top: 18, size: 3, duration: 22, delay: -1, opacity: 0.62 },
  { left: 3, top: 32, size: 2, duration: 18, delay: -6, opacity: 0.54 },
  { left: 1, top: 46, size: 5, duration: 24, delay: -12, opacity: 0.72 },
  { left: 3, top: 60, size: 3, duration: 17, delay: -3, opacity: 0.58 },
  { left: 3, top: 72, size: 4, duration: 26, delay: -20, opacity: 0.7 },
  { left: 1, top: 10, size: 2, duration: 19, delay: -9, opacity: 0.5 },
  { left: 99, top: 14, size: 4, duration: 21, delay: -15, opacity: 0.66 },
  { left: 97, top: 28, size: 2, duration: 20, delay: -22, opacity: 0.56 },
  { left: 99, top: 42, size: 5, duration: 25, delay: -5, opacity: 0.74 },
  { left: 97, top: 56, size: 3, duration: 18, delay: -11, opacity: 0.6 },
  { left: 97, top: 72, size: 4, duration: 23, delay: -27, opacity: 0.68 },
  { left: 99, top: 66, size: 2, duration: 16, delay: -14, opacity: 0.52 },
  { left: 9, top: 26, size: 2, duration: 24, delay: -2, opacity: 0.52 },
  { left: 14, top: 40, size: 4, duration: 19, delay: -16, opacity: 0.66 },
  { left: 20, top: 54, size: 3, duration: 27, delay: -31, opacity: 0.6 },
  { left: 26, top: 68, size: 5, duration: 22, delay: -7, opacity: 0.78 },
  { left: 11, top: 12, size: 2, duration: 17, delay: -13, opacity: 0.5 },
  { left: 17, top: 22, size: 3, duration: 25, delay: -19, opacity: 0.62 },
  { left: 23, top: 34, size: 4, duration: 20, delay: -23, opacity: 0.68 },
  { left: 9, top: 62, size: 2, duration: 18, delay: -4, opacity: 0.54 },
  { left: 91, top: 22, size: 2, duration: 21, delay: -8, opacity: 0.54 },
  { left: 85, top: 36, size: 4, duration: 26, delay: -17, opacity: 0.7 },
  { left: 79, top: 50, size: 3, duration: 18, delay: -24, opacity: 0.6 },
  { left: 74, top: 64, size: 5, duration: 23, delay: -10, opacity: 0.76 },
  { left: 89, top: 12, size: 2, duration: 19, delay: -25, opacity: 0.52 },
  { left: 83, top: 28, size: 3, duration: 22, delay: -29, opacity: 0.64 },
  { left: 77, top: 44, size: 4, duration: 27, delay: -33, opacity: 0.72 },
  { left: 91, top: 58, size: 2, duration: 16, delay: -18, opacity: 0.5 },
  { left: 34, top: 10, size: 4, duration: 21, delay: -30, opacity: 0.7 },
  { left: 38, top: 16, size: 2, duration: 19, delay: -21, opacity: 0.56 },
  { left: 42, top: 13, size: 5, duration: 26, delay: -34, opacity: 0.78 },
  { left: 46, top: 22, size: 2, duration: 17, delay: -26, opacity: 0.54 },
  { left: 50, top: 16, size: 3, duration: 24, delay: -28, opacity: 0.66 },
  { left: 54, top: 18, size: 2, duration: 20, delay: -35, opacity: 0.58 },
  { left: 58, top: 19, size: 3, duration: 23, delay: -37, opacity: 0.62 },
  { left: 62, top: 24, size: 4, duration: 25, delay: -39, opacity: 0.72 },
  { left: 66, top: 22, size: 2, duration: 18, delay: -41, opacity: 0.54 },
  { left: 34, top: 20, size: 3, duration: 22, delay: -43, opacity: 0.64 },
  { left: 38, top: 8, size: 5, duration: 27, delay: -45, opacity: 0.8 },
  { left: 42, top: 24, size: 2, duration: 16, delay: -36, opacity: 0.52 },
  { left: 46, top: 10, size: 3, duration: 20, delay: -38, opacity: 0.6 },
  { left: 50, top: 24, size: 4, duration: 28, delay: -40, opacity: 0.74 },
  { left: 54, top: 12, size: 2, duration: 19, delay: -42, opacity: 0.56 },
  { left: 58, top: 14, size: 3, duration: 21, delay: -44, opacity: 0.62 },
  { left: 62, top: 10, size: 4, duration: 24, delay: -46, opacity: 0.7 },
  { left: 66, top: 14, size: 2, duration: 17, delay: -47, opacity: 0.54 },
  { left: 38, top: 22, size: 3, duration: 23, delay: -48, opacity: 0.66 },
  { left: 60, top: 20, size: 5, duration: 26, delay: -49, opacity: 0.78 },
];

export default function QuizSpray() {
  return (
    <>
      {/* Mist plumes — the air moving on its own, behind the cards. */}
      <div aria-hidden="true" className="quiz-plume-layer pointer-events-none">
        {PLUMES.map((plume, index) => (
          <span
            key={index}
            className="quiz-plume"
            style={
              {
                left: `${plume.left}%`,
                top: `${plume.top}%`,
                width: `${plume.size}px`,
                height: `${plume.size}px`,
                "--plume-dx": `${plume.driftX}px`,
                "--plume-dy": `${plume.driftY}px`,
                animationDuration: `${plume.duration}s`,
                animationDelay: `${plume.delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      {/* Golden motes — dust in low sunlight, drifting up through the margins. */}
      <div
        aria-hidden="true"
        className="quiz-mote-layer pointer-events-none overflow-hidden"
      >
        {MOTES.map((mote, index) => (
          <span
            key={index}
            className="quiz-mote"
            style={
              {
                left: `${mote.left}%`,
                top: `${mote.top}%`,
                width: `${mote.size}px`,
                height: `${mote.size}px`,
                "--mote-opacity": mote.opacity,
                animationDuration: `${mote.duration}s`,
                animationDelay: `${mote.delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </>
  );
}
