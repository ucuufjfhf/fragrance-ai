/**
 * Quiz ambience — the two layers of quiet depth behind the quiz flow.
 *
 * ONE implementation, rendered once by the quiz route (`app/quiz/page.tsx`), so
 * every step of the flow (intro → audience → questions → result → context) sits
 * on the same warm air:
 *
 *  1. ambient breathing gradient — three very soft warm washes on the cream
 *     base, drifting on 13–19s loops;
 *  2. film grain — one static noise tile over the whole route.
 *
 * Purely decorative and cheap: no canvas, no JavaScript loop, no dependencies,
 * no images to download (the grain is an inline SVG data URI). `aria-hidden` and
 * `pointer-events: none` on both layers, so neither is announced to assistive
 * tech nor intercepts a click, a selection or a scroll. Only `transform` and
 * `opacity` animate, and both layers go static under `prefers-reduced-motion`
 * (see `app/globals.css`).
 *
 * Colours come from the existing design tokens only — `--accent` terracotta and
 * `--accent-soft` — so the washes can never introduce a new palette.
 *
 * Readability first: the washes sit BEHIND the quiz card (they only tint the
 * page base around it), and the grain is a 4% greyscale overlay that leaves the
 * card's text at ~12.7:1 in the worst case. Neither layer is allowed to trade
 * contrast for atmosphere.
 */

/** The three washes; only the CSS modifier differs (see `app/globals.css`). */
const WASHES = ["a", "b", "c"] as const;

export default function QuizAmbience() {
  return (
    <>
      {/* Layer 1 — the warm air. Fixed and behind everything, so it never
          scrolls the atmosphere away and never affects layout. */}
      <div
        aria-hidden="true"
        className="quiz-ambience pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
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
