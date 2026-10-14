import type { CSSProperties } from "react";

/**
 * Quiz ambience — the layers of depth behind the quiz flow.
 *
 * ONE implementation, rendered once by the quiz route (`app/quiz/page.tsx`), so
 * every step of the flow (intro → audience → questions → result → context) sits
 * on the same warm air. Paint order, back to front:
 *
 *   washes → BIG GLOW ORBS → ink blooms → fog → plumes → motes
 *     → FROSTED cards → grain → answer pulse
 *
 *  1. ambient breathing gradient — three very soft warm washes on the cream
 *     base, drifting on 13–19s loops;
 *  2. big glow orbs — six large warm light circles (150–350px) with a soft
 *     radial falloff and a clearly visible core, drifting slowly. They are the
 *     stars of the background, and they read twice over: AROUND the cards on a
 *     wide screen and THROUGH the frosted cards on any screen;
 *  3. film grain — one static noise tile over the whole route.
 *
 * The orbs are declared AFTER the washes inside `.quiz-ambience`, so DOM order
 * (equal positioning, no z-index) paints them above the washes and still behind
 * every card — the "washes → big orbs" order the brief asks for.
 *
 * Purely decorative and cheap: no canvas, no JavaScript loop, no dependencies,
 * no images to download (the grain is an inline SVG data URI). `aria-hidden` and
 * `pointer-events: none` on every layer, so none is announced to assistive tech
 * nor intercepts a click, a selection or a scroll. Orb motion is `transform`
 * only, and every layer goes static under `prefers-reduced-motion` (see
 * `app/globals.css`). The orbs' softness is the radial-gradient falloff itself —
 * never a blur filter on an animated layer.
 *
 * Colours come from the existing tokens only — `--accent` terracotta (plus
 * white, for the amber and gold tones) — so no layer introduces a new palette.
 *
 * Readability first: the glow shows through the cards because they are frosted
 * (`.quiz-frost`, ~78% warm-white plus one backdrop-blur), and that plate is
 * sized so the dark body text and the muted labels stay above WCAG AA over the
 * strongest orb — measured in the browser on the built app, not assumed, and
 * locked by `tests/quiz/quiz-ambience.test.tsx`.
 */

/** The three washes; only the CSS modifier differs (see `app/globals.css`). */
const WASHES = ["a", "b", "c"] as const;

/**
 * Hard cap: six glow orbs. The brief asks for 5–7; six fills the air on both a
 * phone and a wide screen without becoming clutter.
 */
export const MAX_ORBS = 6;

/** Orbs are big and bold: 150–350px, so they read as glow, not as specks. */
export const ORB_MIN_SIZE_PX = 150;
export const ORB_MAX_SIZE_PX = 350;

/** The three palette-only tones (see the matching CSS classes). */
type Tone = "terracotta" | "amber" | "gold";

interface Orb {
  /** Position of the orb's centre, % of the viewport. */
  left: number;
  top: number;
  /** Diameter, px (150–350). */
  size: number;
  /** Drift loop, s — slow, so the drift is a mood rather than motion. */
  duration: number;
  /** Start offset, s (negative = begin mid-loop). */
  delay: number;
  /** CORE opacity: the gradient's first stop is the full colour, so this is
   * exactly the alpha the centre of the orb shows. Bold by design (0.25–0.4). */
  opacity: number;
  /** Palette tone — terracotta, amber or gold. */
  tone: Tone;
}

/**
 * Six orbs, spread across the whole viewport.
 *
 * Placement is deliberately unconstrained about the card this time: because the
 * cards are frosted, an orb behind one still reads — blurred and softened — so
 * the orbs can sit where they make the best composition rather than only in the
 * margins. Nothing starts in the footer band, so no glow ever drifts up to the
 * footer copy.
 */
const ORBS: readonly Orb[] = [
  { left: 16, top: 24, size: 300, duration: 78, delay: -12, opacity: 0.32, tone: "terracotta" },
  { left: 84, top: 18, size: 260, duration: 96, delay: -44, opacity: 0.3, tone: "amber" },
  { left: 50, top: 66, size: 350, duration: 108, delay: -66, opacity: 0.34, tone: "gold" },
  { left: 24, top: 74, size: 240, duration: 72, delay: -28, opacity: 0.28, tone: "amber" },
  { left: 88, top: 62, size: 280, duration: 88, delay: -54, opacity: 0.3, tone: "terracotta" },
  { left: 46, top: 32, size: 200, duration: 120, delay: -8, opacity: 0.26, tone: "gold" },
];

export default function QuizAmbience() {
  return (
    <>
      {/* Fixed and behind everything, so the depth never scrolls away and never
          affects layout. */}
      <div
        aria-hidden="true"
        className="quiz-ambience pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        {/* Layer 1 — the warm air. */}
        {WASHES.map((wash) => (
          <span key={wash} className={`quiz-wash quiz-wash-${wash}`} />
        ))}

        {/* Layer 2 — the big glow orbs, on top of the washes (DOM order). */}
        <div aria-hidden="true" className="quiz-orb-layer pointer-events-none">
          {ORBS.map((orb, index) => (
            <span
              key={index}
              className={`quiz-orb quiz-orb-${orb.tone}`}
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
      </div>

      {/* Layer 3 — the grain. Static (no animation at all, so reduced-motion
          needs nothing), and the topmost thing on the route: it textures the
          quiz surfaces themselves as well as the air around them. */}
      <div aria-hidden="true" className="quiz-grain" />
    </>
  );
}
