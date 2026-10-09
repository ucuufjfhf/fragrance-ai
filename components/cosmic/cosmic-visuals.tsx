import type { CSSProperties } from "react";

/**
 * Cosmic Atelier decorative primitives.
 *
 * All three are pure presentational server components: deterministic (seeded,
 * so the sky never re-rolls between renders), lightweight (inline SVG + CSS,
 * no animation library) and non-interactive (`.cosmic-layer` is
 * `pointer-events: none` and every SVG is `aria-hidden`), so they can never
 * block a click, a tab stop or a screen reader.
 */

/** Small seeded PRNG — identical star layout on every server render. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface StarFieldProps {
  /** How many stars to compose. Sparse by design — this is not wallpaper. */
  count?: number;
  seed?: number;
  /** Draw one small constellation between a few of the stars. */
  constellation?: boolean;
  className?: string;
  /** Overall star opacity multiplier (0–1). */
  intensity?: number;
}

const FIELD_W = 1000;
const FIELD_H = 640;

/**
 * A composed, sparse star field. Stars cluster loosely toward the upper half,
 * the way a real sky reads above a horizon, and only a few blink.
 */
export function StarField({
  count = 46,
  seed = 7,
  constellation = true,
  intensity = 1,
  className = "",
}: StarFieldProps) {
  const random = mulberry32(seed * 7919 + 13);
  const stars = Array.from({ length: count }, (_, index) => {
    const x = random() * FIELD_W;
    // Bias toward the top so the lower area stays calm behind content.
    const yRaw = random() ** 1.35 * FIELD_H;
    const y = Math.min(FIELD_H, yRaw);
    const r = 0.5 + random() * 1.5;
    const twinkles = random() > 0.72;
    return {
      key: index,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      r: Number(r.toFixed(2)),
      opacity: Number((0.16 + random() * 0.6).toFixed(2)),
      twinkles,
      delay: Number((random() * 6).toFixed(2)),
      duration: Number((4.5 + random() * 4).toFixed(2)),
    };
  });

  // One restrained constellation: three stars joined by hairline segments.
  const constellationStars = constellation
    ? stars.slice(0, 3).map((star) => ({ x: star.x, y: star.y }))
    : [];

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={`cosmic-layer ${className}`}
      viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
      preserveAspectRatio="xMidYMid slice"
    >
      {constellationStars.length === 3 ? (
        <g
          stroke="var(--celestial-blue)"
          strokeOpacity={0.3}
          strokeWidth={0.7}
          strokeDasharray="3 5"
        >
          <line
            x1={constellationStars[0].x}
            y1={constellationStars[0].y}
            x2={constellationStars[1].x}
            y2={constellationStars[1].y}
          />
          <line
            x1={constellationStars[1].x}
            y1={constellationStars[1].y}
            x2={constellationStars[2].x}
            y2={constellationStars[2].y}
          />
        </g>
      ) : null}

      {stars.map((star) => (
        <circle
          key={star.key}
          cx={star.x}
          cy={star.y}
          r={star.r}
          fill="var(--moonlight-ivory)"
          opacity={star.opacity * intensity}
          className={star.twinkles ? "star-twinkle" : undefined}
          style={
            star.twinkles
              ? ({
                  animationDelay: `${star.delay}s`,
                  animationDuration: `${star.duration}s`,
                } satisfies CSSProperties)
              : undefined
          }
        />
      ))}
    </svg>
  );
}

interface OrbitalDecorationProps {
  /** Rendered size on desktop; scales down on narrow screens. */
  size?: number;
  /** Placement classes from the caller (e.g. "relative mx-auto"). */
  className?: string;
  /** Rotate the thin dashed orbit slowly. */
  drift?: boolean;
}

/**
 * Fine orbital curves around a small champagne core — the recurring atelier
 * mark. Deliberately thin and low-contrast so it never competes with
 * typography or product imagery, and always non-interactive.
 */
export function OrbitalDecoration({
  size = 320,
  drift = true,
  className = "",
}: OrbitalDecorationProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 200 200"
      className={`pointer-events-none select-none ${className}`}
      style={{ width: `clamp(170px, 38vw, ${size}px)`, height: "auto" }}
    >
      <g fill="none" stroke="var(--champagne)" strokeOpacity={0.32}>
        <circle cx="100" cy="100" r="34" strokeWidth={0.6} />
        <ellipse cx="100" cy="100" rx="76" ry="30" strokeWidth={0.6} strokeDasharray="2 6" />
        <ellipse
          cx="100"
          cy="100"
          rx="30"
          ry="72"
          strokeWidth={0.6}
          strokeDasharray="2 6"
          strokeOpacity={0.22}
          transform="rotate(28 100 100)"
        />
      </g>
      <g className={drift ? "orbit-drift" : undefined}>
        <circle cx="176" cy="100" r="1.6" fill="var(--champagne)" fillOpacity={0.9} />
        <circle cx="100" cy="28" r="1.1" fill="var(--moonlight-ivory)" fillOpacity={0.55} />
      </g>
      <circle cx="100" cy="100" r="3.2" fill="var(--champagne)" fillOpacity={0.85} />
      <circle cx="100" cy="100" r="11" fill="var(--champagne)" fillOpacity={0.08} />
    </svg>
  );
}

interface CosmicBackdropProps {
  /** Star count for this backdrop (keep it low in content-dense sections). */
  stars?: number;
  seed?: number;
  /** Add the soft radial atmospheric light. */
  atmosphere?: boolean;
  /** Add the fine grain overlay (dark, dramatic sections only). */
  grain?: boolean;
  constellation?: boolean;
  intensity?: number;
}

/**
 * The full atmospheric layer stack for a dark section:
 * atmospheric light → composed star field → optional grain.
 * The section itself provides `relative isolate` positioning.
 */
export function CosmicBackdrop({
  stars = 46,
  seed = 7,
  atmosphere = true,
  grain = false,
  constellation = true,
  intensity = 1,
}: CosmicBackdropProps) {
  return (
    <div className={`cosmic-layer ${grain ? "grain" : ""}`} aria-hidden="true">
      {atmosphere ? <div className="atmosphere" /> : null}
      <StarField
        count={stars}
        seed={seed}
        constellation={constellation}
        intensity={intensity}
      />
    </div>
  );
}
