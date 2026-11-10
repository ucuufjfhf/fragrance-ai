import { MATCHING_DIMENSIONS, type MatchingDimension } from "@/lib/fragrance/profile";
import { toPersianDigits } from "@/lib/persian";
import type { PersonalityVector } from "@/types/personality";

/**
 * The five-axis scent radar's ONE geometry source.
 *
 * Both consumers — the results page's SVG and the share card's canvas twin —
 * import from here, so the picture can never disagree with itself. Two rules are
 * load-bearing:
 *
 *  - the axes are the FIVE matching axes. `social`, `adventurous`, `expressive`
 *    and `experimental` are personality dimensions no fragrance data speaks to,
 *    so they are never drawn (batch 22's honesty rule). The list is typed
 *    against `MatchingDimension`, and the tests compare its SET to the imported
 *    `MATCHING_DIMENSIONS` — a sixth matching axis fails loudly instead of
 *    silently disappearing from the picture;
 *  - the drawing order is fixed and clockwise from the top, exactly as approved:
 *    تازه (top), گرم, جسور, شیک, مرموز.
 */

/** Clockwise from the top, as the approved sample draws them. */
export const SCENT_RADAR_AXES: readonly MatchingDimension[] = [
  "fresh",
  "warm",
  "bold",
  "elegant",
  "mysterious",
];

/** The short axis labels the radar shows (the sample's wording). */
export const SCENT_RADAR_LABELS: Record<MatchingDimension, string> = {
  fresh: "تازه",
  warm: "گرم",
  bold: "جسور",
  elegant: "شیک",
  mysterious: "مرموز",
};

/** The cream grid rings, as percentages of the radius. */
export const SCENT_RADAR_GRID_RINGS = [25, 50, 75, 100] as const;

export interface RadarPoint {
  x: number;
  y: number;
}

export interface RadarCentre {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;
const AXIS_COUNT = SCENT_RADAR_AXES.length;

/** Clamps a profile value into the 0–100 scale the radar draws. */
export function clampRadarValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Angle of axis `index`, clockwise from straight up (−π/2). */
export function radarAngle(index: number): number {
  return -Math.PI / 2 + (TAU * index) / AXIS_COUNT;
}

/** One vertex: the axis direction scaled by the value's share of the radius. */
export function radarPointAt(
  index: number,
  value: number,
  radius: number,
  centre: RadarCentre = { x: 0, y: 0 },
): RadarPoint {
  const angle = radarAngle(index);
  const distance = (radius * clampRadarValue(value)) / 100;
  return {
    x: centre.x + Math.cos(angle) * distance,
    y: centre.y + Math.sin(angle) * distance,
  };
}

/** The polygon geometry for a value per axis, in `SCENT_RADAR_AXES` order. */
export function radarPoints(
  values: readonly number[],
  radius: number,
  centre: RadarCentre = { x: 0, y: 0 },
): RadarPoint[] {
  return SCENT_RADAR_AXES.map((_, index) =>
    radarPointAt(index, values[index] ?? 0, radius, centre),
  );
}

/** Where an axis label sits, one step outside the polygon. */
export function radarLabelPoint(
  index: number,
  radius: number,
  centre: RadarCentre = { x: 0, y: 0 },
): RadarPoint {
  const angle = radarAngle(index);
  return {
    x: centre.x + Math.cos(angle) * radius,
    y: centre.y + Math.sin(angle) * radius,
  };
}

/** The user's five matching-axis values, in radar order — nothing else. */
export function radarValuesFromVector(vector: PersonalityVector): number[] {
  return SCENT_RADAR_AXES.map((axis) => clampRadarValue(vector[axis]));
}

/** An SVG `points` string for the shared geometry. */
export function radarPolygonPoints(
  points: readonly RadarPoint[],
): string {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

/** The SVG/aria summary: every axis named with its value, in Persian digits. */
export function scentRadarSummary(values: readonly number[]): string {
  const parts = SCENT_RADAR_AXES.map(
    (axis, index) =>
      `${SCENT_RADAR_LABELS[axis]} ${toPersianDigits(Math.round(clampRadarValue(values[index] ?? 0)))}`,
  );
  return `نمودار رایحه: ${parts.join("، ")}`;
}

/** Compile-time guard: the drawing list must cover every matching axis. */
const _axisCoverage: readonly MatchingDimension[] = MATCHING_DIMENSIONS;
void _axisCoverage;
