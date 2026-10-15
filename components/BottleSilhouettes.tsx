import type { CSSProperties } from "react";

/**
 * Bottle silhouettes — the six bottle illustrations as DEPTH, never as product
 * art.
 *
 * The bottles in `public/perfumes/bottles/` are decoration. They are deliberately
 * NOT what illustrates a recommendation: the cards use the abstract artwork in
 * `lib/perfumes/artwork.ts`, and this component is the only place a bottle file is
 * referenced at all. Everything here is a faint ghost of glass in the air behind
 * the page — a suggestion of depth, never a focal object, and never a claim about
 * any perfume.
 *
 * Two placements, one look (the look itself lives in `app/globals.css`):
 *  - `variant="quiz"` — three large shapes hugging the viewport edges. Rendered
 *    as the FIRST child inside `.quiz-ambience`, so DOM order puts them behind
 *    every other ambience layer: the washes, the glow orbs, the ink blooms, the
 *    clearing fog and the spray bokeh all paint over them;
 *  - `variant="accent"` — the results screen's single note of depth, in its own
 *    fixed `-z-10` backdrop behind the content.
 *
 * Inert and cheap: `aria-hidden`, `pointer-events: none`, a CSS `background-image`
 * on a plain element, no JavaScript, no canvas, no animation of any kind — so
 * `prefers-reduced-motion` has nothing to freeze, and nothing here can intercept
 * a click, a selection or a scroll. Opacity stays inside the barely-there
 * 0.05–0.08 band (see `SILHOUETTE_*_OPACITY`) and is the only per-shape knob.
 */

/** The bundled bottles a silhouette may use. */
export type BottleSilhouetteId =
  | "terracotta"
  | "wine"
  | "champagne"
  | "amber-apothecary"
  | "rose-gold"
  | "oud";

const BOTTLE_SOURCES: Record<BottleSilhouetteId, string> = {
  terracotta: "/perfumes/bottles/bottle-terracotta.webp",
  wine: "/perfumes/bottles/bottle-wine.webp",
  champagne: "/perfumes/bottles/bottle-champagne.webp",
  "amber-apothecary": "/perfumes/bottles/bottle-amber-apothecary.webp",
  "rose-gold": "/perfumes/bottles/bottle-rose-gold.webp",
  oud: "/perfumes/bottles/bottle-oud.webp",
};

/** The band every shape's opacity has to sit in: depth, never a focal object. */
export const SILHOUETTE_MIN_OPACITY = 0.05;
export const SILHOUETTE_MAX_OPACITY = 0.08;

/** The quiz field is capped at three shapes — enough for depth, never clutter. */
export const MAX_QUIZ_SILHOUETTES = 3;

interface Shape {
  bottle: BottleSilhouetteId;
  /** Horizontal anchor, % of the viewport. Exactly one of the two is set. */
  left?: number;
  right?: number;
  /** Vertical anchor, % of the viewport. */
  top: number;
  /** Width, with the height following from the 16:10 frame in the CSS. */
  width: string;
  /** 0.05–0.08 — the faintness of this shape. */
  opacity: number;
}

/**
 * The quiz trio: the edges only, deliberately alternating so the shapes read as a
 * slow rhythm down the page rather than as one column. Every anchor is negative,
 * so each shape is cropped by the viewport edge and can never read as a framed
 * picture. The bottles differ from one another so the shapes are not a repeated
 * stamp; each stays on the *distant* side of the band (0.06–0.08) because the
 * washes and orbs paint over them.
 */
const QUIZ_SHAPES: readonly Shape[] = [
  { bottle: "terracotta", left: -16, top: 14, width: "min(58vw, 540px)", opacity: 0.08 },
  { bottle: "amber-apothecary", right: -18, top: 44, width: "min(54vw, 500px)", opacity: 0.07 },
  { bottle: "oud", left: -12, top: 76, width: "min(48vw, 460px)", opacity: 0.06 },
];

/**
 * The results accent: ONE shape, upper right. Lower alpha than the quiz shapes on
 * purpose — the results screen has no washes in front of it to soften it, so the
 * shadow has to be quieter on its own.
 */
const RESULT_ACCENT: readonly Shape[] = [
  { bottle: "rose-gold", right: -10, top: 8, width: "min(56vw, 520px)", opacity: 0.06 },
];

function shapeStyle(shape: Shape): CSSProperties {
  return {
    left: shape.left === undefined ? undefined : `${shape.left}%`,
    right: shape.right === undefined ? undefined : `${shape.right}%`,
    top: `${shape.top}%`,
    width: shape.width,
    "--silhouette-opacity": shape.opacity,
  } as CSSProperties;
}

interface BottleSilhouettesProps {
  /**
   * `quiz` → the three-shape field for inside `.quiz-ambience` (absolute, behind
   * every ambience layer). `accent` → one shape in its own fixed `-z-10`
   * backdrop for the results screen.
   */
  variant: "quiz" | "accent";
}

export default function BottleSilhouettes({ variant }: BottleSilhouettesProps) {
  const shapes = variant === "quiz" ? QUIZ_SHAPES : RESULT_ACCENT;

  return (
    <div
      aria-hidden="true"
      className={`${
        variant === "quiz" ? "bottle-silhouette-layer" : "bottle-silhouette-backdrop"
      } pointer-events-none`}
    >
      {shapes.map((shape) => (
        <span
          key={shape.bottle}
          className="bottle-silhouette"
          style={{
            ...shapeStyle(shape),
            backgroundImage: `url(${BOTTLE_SOURCES[shape.bottle]})`,
          }}
        />
      ))}
    </div>
  );
}
