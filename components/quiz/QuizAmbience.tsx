import type { CSSProperties } from "react";

/**
 * Quiz ambience — the quiet depth behind the quiz flow.
 *
 * ONE implementation, rendered once by the quiz route (`app/quiz/page.tsx`), so
 * every step of the flow (intro → audience → questions → result → context) sits
 * on the same warm air:
 *
 *  1. bokeh orbs — a handful of large, very soft out-of-focus warm light
 *     circles drifting extremely slowly in the DEEP background, behind the
 *     washes. They give the air depth (a foreground/background read) without
 *     ever sitting near the cards;
 *  2. ambient breathing gradient — three very soft warm washes on the cream
 *     base, drifting on 13–19s loops;
 *  3. film grain — one static noise tile over the whole route.
 *
 * Purely decorative and cheap: no canvas, no JavaScript loop, no dependencies,
 * no images to download (the grain is an inline SVG data URI). `aria-hidden` and
 * `pointer-events: none` on every layer, so none is announced to assistive tech
 * nor intercepts a click, a selection or a scroll. Only `transform` and
 * `opacity` animate, and every layer goes static under `prefers-reduced-motion`
 * (see `app/globals.css`). The orbs' out-of-focus softness is baked into their
 * radial-gradient falloff — never a blur filter on an animated layer.
 *
 * Colours come from the existing design tokens only — `--accent` terracotta and
 * `--accent-soft` — so no layer can introduce a new palette.
 *
 * Readability first: the orbs, the washes and the grain sit behind the opaque
 * quiz cards (the washes/orbs only tint the page base around them), and the
 * grain is a 4% greyscale overlay that leaves the card's text at ~12.7:1 in the
 * worst case. No layer is allowed to trade contrast for atmosphere.
 */

/** The three washes; only the CSS modifier differs (see `app/globals.css`). */
const WASHES = ["a", "b", "c"] as const;

/**
 * Hard cap: eight bokeh orbs, no more. The brief asks for 6–8 large soft
 * circles; eight is the fullest this layer is allowed to get.
 */
export const MAX_ORBS = 8;

/** Orbs are large and soft: 60–140px, so they read as light, never as shapes. */
export const ORB_MIN_SIZE_PX = 60;
export const ORB_MAX_SIZE_PX = 140;

interface Orb {
  /** Position of the orb's centre, % of the viewport. */
  left: number;
  top: number;
  /** Diameter, px (60–140). */
  size: number;
  /** Drift loop, s — deliberately enormous, so the drift is barely perceptible. */
  duration: number;
  /** Start offset, s (negative = begin mid-loop). */
  delay: number;
  /** Base opacity; the keyframe swells it slightly. Very low by design. */
  opacity: number;
}

/**
 * Eight orbs, placed by the same free-air rule as the spray: a circle whose
 * whole body sits behind the opaque card would not render, so each orb's CORE
 * lives where the card leaves air open — the narrow side strips (x ≈ 2–5% /
 * x ≈ 95–98%, the 16px margins beside the card on a phone) or the band under
 * the header (top ≤ 10%). The soft body then bleeds under the card, which is
 * exactly the deep-background depth the brief asks for. Nothing starts in the
 * footer band, so no orb ever drifts up to the footer copy.
 *
 * Placement is measured, not guessed: the first pass centred the orbs on the
 * page, which put six of the eight entirely behind the card on a 390px phone
 * and contributed ≤1 pixel level there. Locked to the free air, the cores are
 * visible on every viewport.
 */
const ORBS: readonly Orb[] = [
  { left: 3, top: 26, size: 130, duration: 72, delay: -12, opacity: 0.13 },
  { left: 97, top: 22, size: 120, duration: 88, delay: -40, opacity: 0.12 },
  { left: 2, top: 58, size: 140, duration: 64, delay: -24, opacity: 0.14 },
  { left: 98, top: 54, size: 130, duration: 96, delay: -56, opacity: 0.12 },
  { left: 35, top: 9, size: 100, duration: 80, delay: -8, opacity: 0.1 },
  { left: 64, top: 10, size: 90, duration: 104, delay: -64, opacity: 0.09 },
  { left: 98, top: 72, size: 110, duration: 68, delay: -32, opacity: 0.11 },
  { left: 2, top: 70, size: 100, duration: 92, delay: -48, opacity: 0.11 },
];

export default function QuizAmbience() {
  return (
    <>
      {/* Layer 0 — the deep background: bokeh orbs, painted FIRST inside the
          ambience container so they sit beneath its opaque cream base's
          washes. Fixed and behind everything, so they never scroll the
          atmosphere away and never affect layout. */}
      <div
        aria-hidden="true"
        className="quiz-ambience pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div aria-hidden="true" className="quiz-bokeh-layer pointer-events-none">
          {ORBS.map((orb, index) => (
            <span
              key={index}
              className="quiz-bokeh"
              style={
                {
                  left: `${orb.left}%`,
                  top: `${orb.top}%`,
                  width: `${orb.size}px`,
                  height: `${orb.size}px`,
                  "--orb-opacity": orb.opacity,
                  animationDuration: `${orb.duration}s`,
                  animationDelay: `${orb.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        {/* Layer 1 — the warm air, on top of the orbs. */}
        {WASHES.map((wash) => (
          <span key={wash} className={`quiz-wash quiz-wash-${wash}`} />
        ))}
      </div>

      {/* Layer 2 — the grain. Static (no animation at all, so reduced-motion
          needs nothing), and the topmost thing on the route: it textures the
          quiz surfaces themselves as well as the air around them. */}
      <div aria-hidden="true" className="quiz-grain" />
    </>
  );
}
