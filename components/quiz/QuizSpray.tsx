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
 *     drifts, and dissipates over ~5s, then repeats on its own cycle. Three
 *     nodes, so at most three are ever alive.
 *  2. golden motes — 24 tiny warm specks drifting slowly upward with a gentle
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
 *   washes (QuizAmbience) → ink blooms → clearing fog (QuizAtmosphere)
 *     → mist plumes → golden motes   ← this file
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
 * composite only repeats after minutes (the three plume periods are coprime-ish:
 * the puff is the first 38% of the cycle), while the motes drift on 16–26s loops.
 *
 * Plume timing is evenly spaced on purpose, and by simulation rather than by
 * feel: three equal 15s cycles phased 0s / −5s / −10s start a puff every 5s,
 * which is the cadence the brief asks for (4–7s) and is what keeps the mist
 * continuous. Unequal periods (the obvious way to look "organic") drift out of
 * phase and open real lulls: a 14/15/16s set with phases 0/−9/−4 measured gaps
 * of 6–25s between puff cycles and up to 8.7s with no mist anywhere on screen.
 * Both layers set `aria-hidden` and `pointer-events: none`, animate only
 * `transform`/`opacity`, carry no filters, and hold their node caps by
 * construction (`MAX_PLUMES`, `MAX_MOTES`) — see the CSS in `app/globals.css`.
 *
 * Colours come from the existing tokens only (`--accent` and `white`, exactly
 * like act 1's washes and the results-page particles), so no new palette enters
 * the project. Under `prefers-reduced-motion` the plumes hold a faint static
 * state and the motes are removed entirely.
 */

/** Hard cap: three plumes alive at most, one per configured node. */
export const MAX_PLUMES = 3;

/** Hard cap: the mote field is 24 specks, no more. */
export const MAX_MOTES = 24;

/** Motes are specks: 2–4px, so they can never become a shape. */
export const MOTE_MIN_SIZE_PX = 2;
export const MOTE_MAX_SIZE_PX = 4;

interface Plume {
  /** Origin, % of the viewport. */
  left: number;
  top: number;
  /** Diameter at rest, px. */
  size: number;
  /**
   * Full puff cycle, s. All three nodes share it so their starts stay evenly
   * spaced (see PLUMES), and 38% of it is the puff itself — 5.7s here.
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
 */
const PLUMES: readonly Plume[] = [
  { left: 26, top: 9, size: 340, duration: 15, delay: 0, driftX: 24, driftY: 18 },
  { left: 74, top: 8, size: 380, duration: 15, delay: -5, driftX: -28, driftY: 22 },
  { left: 10, top: 44, size: 360, duration: 15, delay: -10, driftX: 30, driftY: -26 },
];

interface Mote {
  /** Start position, % of the viewport; the drift carries it upward from there. */
  left: number;
  top: number;
  /** Diameter, px (2–4). */
  size: number;
  /** Drift loop, s. */
  duration: number;
  /** Start offset, s (negative = begin mid-loop). */
  delay: number;
  /** Twinkle intensity, drives the keyframe opacity via `--mote-opacity`. */
  opacity: number;
}

/**
 * 24 hand-placed motes: spread across the field, every loop phase distinct.
 *
 * Three groups, chosen for the air each viewport actually leaves free — a mote
 * whose CORE is behind the opaque card does not exist, so placement is the whole
 * of the effect here (measured, not assumed):
 *
 *  · edge columns (x ≤ 3% / x ≥ 97%) — the 16px strips beside the card on a
 *    phone, and the outer margins on a wide screen. Visible for the whole climb
 *    on both;
 *  · side bands (x 9–26% / 74–91%) — the wide viewports' margins;
 *  · middle columns (x 34–66%, starting at 10–25%) — behind the card, except
 *    that their 134px climb carries them up through the free band under the
 *    header, which is the one strip of air a phone has as well.
 *
 * Nothing starts below 72%, so the footer band stays clear of dust.
 */
const MOTES: readonly Mote[] = [
  { left: 1, top: 18, size: 3, duration: 22, delay: -1, opacity: 0.5 },
  { left: 3, top: 32, size: 2, duration: 18, delay: -6, opacity: 0.42 },
  { left: 1, top: 46, size: 4, duration: 24, delay: -12, opacity: 0.6 },
  { left: 3, top: 60, size: 2, duration: 17, delay: -3, opacity: 0.4 },
  { left: 99, top: 14, size: 3, duration: 21, delay: -9, opacity: 0.52 },
  { left: 97, top: 28, size: 2, duration: 19, delay: -15, opacity: 0.44 },
  { left: 99, top: 42, size: 4, duration: 25, delay: -5, opacity: 0.62 },
  { left: 97, top: 72, size: 3, duration: 20, delay: -11, opacity: 0.5 },
  { left: 9, top: 26, size: 2, duration: 16, delay: -2, opacity: 0.38 },
  { left: 14, top: 40, size: 3, duration: 23, delay: -14, opacity: 0.55 },
  { left: 20, top: 54, size: 2, duration: 19, delay: -18, opacity: 0.46 },
  { left: 26, top: 68, size: 4, duration: 26, delay: -7, opacity: 0.66 },
  { left: 91, top: 22, size: 2, duration: 17, delay: -13, opacity: 0.4 },
  { left: 85, top: 36, size: 3, duration: 22, delay: -4, opacity: 0.5 },
  { left: 79, top: 50, size: 2, duration: 18, delay: -10, opacity: 0.42 },
  { left: 74, top: 64, size: 3, duration: 24, delay: -16, opacity: 0.56 },
  { left: 34, top: 10, size: 3, duration: 21, delay: -8, opacity: 0.52 },
  { left: 42, top: 13, size: 2, duration: 16, delay: -20, opacity: 0.38 },
  { left: 50, top: 16, size: 4, duration: 25, delay: -6, opacity: 0.64 },
  { left: 58, top: 19, size: 2, duration: 19, delay: -17, opacity: 0.44 },
  { left: 66, top: 22, size: 3, duration: 23, delay: -21, opacity: 0.54 },
  { left: 38, top: 25, size: 2, duration: 18, delay: -12, opacity: 0.4 },
  { left: 46, top: 12, size: 3, duration: 20, delay: -9, opacity: 0.48 },
  { left: 54, top: 18, size: 4, duration: 26, delay: -3, opacity: 0.6 },
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
