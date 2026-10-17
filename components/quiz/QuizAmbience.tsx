import type { CSSProperties } from "react";

import BottleSilhouettes from "@/components/BottleSilhouettes";

/**
 * Quiz ambience — the layers of depth behind the quiz flow.
 *
 * ONE implementation, rendered once by the quiz route (`app/quiz/page.tsx`), so
 * every step of the flow (intro → audience → questions → result → context) sits
 * on the same warm air. Paint order, back to front:
 *
 *   bottle silhouettes (faintest) → washes → BIG GLOW ORBS → reading wash
 *     → ink blooms → fog → plumes → motes
 *     → unboxed content → grain → answer pulse
 *
 *  1. ambient breathing gradient — three very soft warm washes on the cream
 *     base, drifting on 13–19s loops;
 *  2. big glow orbs — six large light circles (150–350px) with a soft radial
 *     falloff and a clearly visible core, floating on a gentle vertical bob.
 *     Four are warm (terracotta, amber, gold) and two are deep wine: the
 *     wine-and-gold pairing is the luxury-perfume note. They are the stars of
 *     the background, and they read twice over: AROUND the cards on a wide
 *     screen and THROUGH the frosted cards on any screen;
 *  3. film grain — one static noise tile over the whole route.
 *
 * The orbs are declared AFTER the washes inside `.quiz-ambience`, so DOM order
 * (equal positioning, no z-index) paints them above the washes and still behind
 * every card — the "washes → big orbs" order the brief asks for.
 *
 * Layer 0 — the bottle silhouettes. Three large, very faint ghosts of glass
 * hugging the viewport edges, declared FIRST inside the container so DOM order
 * keeps them behind the washes, the orbs and everything the flow layers on top.
 * They are static (no animation at all) and are the one place the bottle
 * illustrations appear — decoration only, never product art. The look lives in
 * `app/globals.css`; the placement in `components/BottleSilhouettes.tsx`.
 *
 * Purely decorative and cheap: no canvas, no JavaScript loop, no dependencies,
 * no images to download (the grain is an inline SVG data URI). `aria-hidden` and
 * `pointer-events: none` on every layer, so none is announced to assistive tech
 * nor intercepts a click, a selection or a scroll. Orb motion is `transform`
 * only, and every layer goes static under `prefers-reduced-motion` (see
 * `app/globals.css`). The orbs' softness is the radial-gradient falloff itself —
 * never a blur filter on an animated layer.
 *
 * Colours come from tokens: `--accent` terracotta and white for the amber and
 * gold tones, plus the one new palette tone this pass adds — `--wine`. The wine
 * orbs sit at the LOW end of the opacity band (0.26) precisely because wine is
 * the darkest tone: it dims the page more per unit of alpha than gold does, so
 * the same visual weight costs less of the contrast budget the frosted plate
 * spends.
 *
 * Readability first: the quiz content is unboxed (no card, no frosted panel),
 * so the dark body text and the muted labels sit on the air itself. The
 * reading wash below lifts the orb cores behind the content column back into
 * the AA budget — measured in the browser on the built app, not assumed, and
 * locked by `tests/quiz/quiz-ambience.test.tsx`. (`.quiz-frost` and its
 * `--muted-on-plate` token survive for the result-phase profile card, which
 * keeps its frosted glass.)
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

/** The palette-only tones (see the matching CSS classes). */
type Tone = "terracotta" | "amber" | "gold" | "wine";

interface Orb {
  /** Position of the orb's centre, % of the viewport. */
  left: number;
  top: number;
  /** Diameter, px (150–350). */
  size: number;
  /** Float loop, s — halved from the first pass, so the float reads as motion. */
  duration: number;
  /** Start offset, s (negative = begin mid-loop). */
  delay: number;
  /** CORE opacity: the gradient's first stop is the full colour, so this is
   * exactly the alpha the centre of the orb shows. Bold by design (0.25–0.4). */
  opacity: number;
  /** Vertical bob, % of the orb's own size — the sine-like float's amplitude. */
  bob: number;
  /** Palette tone — terracotta, amber, gold or wine. */
  tone: Tone;
}

/**
 * Six orbs, spread across the whole viewport.
 *
 * Two of them — upper-left and lower-right, the diagonal — are the wine pair;
 * the other four stay warm. The wine orbs carry the LOWEST cores (0.26, the
 * bottom of the band) because wine is the darkest tone: its alpha dims the page
 * far more per unit than gold's does, so the same visual weight costs less
 * contrast budget. The sweep in tests/quiz/quiz-ambience.test.tsx checks every
 * tone against its own core rather than assuming the accent for all of them.
 *
 * The float loops are half their first-pass length and every orb carries a
 * gentle vertical bob (6–8% of its own size), so the rise and fall reads as
 * floating in liquid air rather than as a slow diagonal creep. The negative
 * delays keep the original phases, so the six never sync up.
 *
 * Placement is deliberately unconstrained about the card: because the cards are
 * frosted, an orb behind one still reads — blurred and softened — so the orbs
 * can sit where they make the best composition rather than only in the margins.
 * Nothing starts in the footer band, so no glow ever drifts up to the footer
 * copy.
 */
const ORBS: readonly Orb[] = [
  { left: 16, top: 24, size: 300, duration: 39, delay: -6, opacity: 0.26, bob: 7, tone: "wine" },
  { left: 84, top: 18, size: 260, duration: 48, delay: -22, opacity: 0.3, bob: 7, tone: "amber" },
  { left: 50, top: 66, size: 350, duration: 54, delay: -33, opacity: 0.34, bob: 8, tone: "gold" },
  { left: 24, top: 74, size: 240, duration: 36, delay: -14, opacity: 0.28, bob: 7, tone: "amber" },
  { left: 88, top: 62, size: 280, duration: 44, delay: -27, opacity: 0.26, bob: 8, tone: "wine" },
  { left: 46, top: 32, size: 200, duration: 60, delay: -4, opacity: 0.26, bob: 6, tone: "gold" },
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
        {/* Layer 0 — the bottle silhouettes: the backmost depth on the route.
            Inert, static, and behind every other layer by DOM order. */}
        <BottleSilhouettes variant="quiz" />

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
                  "--orb-bob": `${orb.bob}%`,
                  animationDuration: `${orb.duration}s`,
                  animationDelay: `${orb.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        {/* Layer 2b — the reading wash. The quiz content is unboxed, so muted
            text would fall below AA over the strongest orb cores (the big
            gold core sits mid-column). This soft white veil lifts those cores
            back into budget: feathered to transparent, no edges, no border,
            no panel — invisible by design, and static (nothing to freeze, so
            reduced-motion needs nothing). Existing layers above and below are
            untouched. */}
        <div aria-hidden="true" className="quiz-reading-wash pointer-events-none" />
      </div>

      {/* Layer 3 — the grain. Static (no animation at all, so reduced-motion
          needs nothing), and the topmost thing on the route: it textures the
          quiz surfaces themselves as well as the air around them. */}
      <div aria-hidden="true" className="quiz-grain" />
    </>
  );
}
