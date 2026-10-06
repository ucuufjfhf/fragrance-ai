import type { CSSProperties } from "react";

/**
 * Shared ambient background — a field of small, slowly floating accent-tinted
 * particles, animated with CSS only.
 *
 * ONE implementation, used by BOTH personality-result screens:
 *  - the Fragrance Profile screen (`components/quiz/QuizResultCard.tsx`)
 *  - the Recommendations screen (`components/results/ResultsView.tsx`)
 *
 * There is deliberately no second copy: both screens render this component and
 * nothing else for the effect.
 *
 * Purely decorative and cheap:
 *  - no canvas, no JavaScript animation loop, no dependencies;
 *  - `pointer-events: none` and `aria-hidden`, so it never intercepts input or
 *    is announced to assistive tech;
 *  - the drift is a single CSS keyframe animation, disabled entirely under
 *    `prefers-reduced-motion` (see `app/globals.css`).
 *
 * Colour comes from the scoped `--accent` design token it inherits from the
 * screen that renders it, so the particles follow each screen's archetype
 * accent automatically.
 */

interface Particle {
  /** Horizontal position, % of the layer. */
  left: number;
  /** Vertical position, % of the layer. */
  top: number;
  /** Diameter, px. */
  size: number;
  /** Animation delay, s — staggers the drift so particles are not in sync. */
  delay: number;
  /** Animation duration, s (kept in the slow 15–30 s band). */
  duration: number;
  /** Base intensity (drives the keyframe opacity via `--particle-opacity`). */
  opacity: number;
}

/** 12 hand-placed particles (within the requested 8–15), deterministic. */
const PARTICLES: readonly Particle[] = [
  { left: 8, top: 14, size: 5, delay: 0, duration: 22, opacity: 0.45 },
  { left: 22, top: 38, size: 3, delay: 3.5, duration: 27, opacity: 0.3 },
  { left: 34, top: 9, size: 4, delay: 7, duration: 19, opacity: 0.4 },
  { left: 47, top: 55, size: 6, delay: 1.5, duration: 30, opacity: 0.35 },
  { left: 58, top: 24, size: 3, delay: 9, duration: 24, opacity: 0.3 },
  { left: 69, top: 68, size: 5, delay: 4.5, duration: 26, opacity: 0.42 },
  { left: 78, top: 41, size: 4, delay: 11, duration: 21, opacity: 0.33 },
  { left: 88, top: 16, size: 3, delay: 6, duration: 28, opacity: 0.3 },
  { left: 15, top: 72, size: 4, delay: 12.5, duration: 23, opacity: 0.38 },
  { left: 63, top: 88, size: 3, delay: 2.5, duration: 29, opacity: 0.28 },
  { left: 92, top: 61, size: 5, delay: 8, duration: 25, opacity: 0.36 },
  { left: 41, top: 82, size: 4, delay: 10.5, duration: 20, opacity: 0.34 },
];

export default function AmbientParticles() {
  return (
    <div
      aria-hidden="true"
      className="ambient-particles pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className="ambient-particle"
          style={
            {
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              "--particle-opacity": particle.opacity,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
