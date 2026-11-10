"use client";

import { useEffect, useRef, useState } from "react";

import {
  SCENT_RADAR_AXES,
  SCENT_RADAR_GRID_RINGS,
  SCENT_RADAR_LABELS,
  radarLabelPoint,
  radarPoints,
  radarPolygonPoints,
  radarValuesFromVector,
  scentRadarSummary,
} from "@/lib/fragrance/radar";
import { toPersianDigits } from "@/lib/persian";
import type { PersonalityVector } from "@/types/personality";

/**
 * The five-axis scent radar for /result — the picture; `TraitBars` right below
 * it stays the detail, so the radar never becomes the only carrier of numbers.
 *
 * Only the five MATCHING axes are drawn (fresh, warm, bold, elegant, mysterious
 * — clockwise from the top); the four personality axes never appear, because no
 * fragrance data speaks to them. Geometry comes from `lib/fragrance/radar.ts`,
 * the same module the share card's canvas twin uses.
 *
 * The grow is one-shot, on first visibility, in the trait bars' duration family
 * (900ms, the same easing). Server markup and reduced motion both show the
 * finished polygon: the animation class is only added after mount, by an
 * observer, and never for a shopper who asked for less motion.
 */

const RADIUS = 100;
const LABEL_RADIUS = 118;

export default function ScentRadar({ vector }: { vector: PersonalityVector }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [animate, setAnimate] = useState(false);

  const values = radarValuesFromVector(vector);
  const points = radarPoints(values, RADIUS);
  const summary = scentRadarSummary(values);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimate(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-label="نمودار رایحه"
      className="flex flex-col items-center gap-4 rounded-3xl border border-border-soft bg-surface p-6 shadow-[var(--shadow-card)]"
    >
      <svg
        role="img"
        aria-label={summary}
        viewBox="-140 -140 280 280"
        className="h-auto w-full max-w-[300px]"
      >
        <g className={animate ? "scent-radar-grow" : undefined}>
          {/* Cream grid rings at 25 / 50 / 75 / 100. */}
          {SCENT_RADAR_GRID_RINGS.map((ring) => (
            <polygon
              key={ring}
              points={radarPolygonPoints(
                radarPoints(SCENT_RADAR_AXES.map(() => ring), RADIUS),
              )}
              fill="none"
              stroke="var(--marker-gold)"
              strokeOpacity={ring === 100 ? 0.45 : 0.22}
              strokeWidth={1}
            />
          ))}

          {/* Spokes: one per matching axis. */}
          {points.map((point, index) => (
            <line
              key={`spoke-${SCENT_RADAR_AXES[index]}`}
              x1={0}
              y1={0}
              x2={radarLabelPoint(index, RADIUS).x}
              y2={radarLabelPoint(index, RADIUS).y}
              stroke="var(--marker-gold)"
              strokeOpacity={0.2}
              strokeWidth={1}
            />
          ))}

          {/* The user's own polygon — gold fill, gold edge, wine vertices. */}
          <polygon
            points={radarPolygonPoints(points)}
            fill="var(--marker-gold)"
            fillOpacity={0.18}
            stroke="var(--marker-gold)"
            strokeWidth={2}
          />
          {points.map((point, index) => (
            <circle
              key={`dot-${SCENT_RADAR_AXES[index]}`}
              cx={point.x}
              cy={point.y}
              r={3.5}
              fill="var(--wine)"
            />
          ))}
        </g>

        {/* Axis labels sit outside the polygon, so they stay readable at 0. */}
        {SCENT_RADAR_AXES.map((axis, index) => {
          const at = radarLabelPoint(index, LABEL_RADIUS);
          return (
            <text
              key={`label-${axis}`}
              x={at.x}
              y={at.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={13}
              fill="var(--muted)"
            >
              {SCENT_RADAR_LABELS[axis]}
            </text>
          );
        })}
      </svg>

      {/* Value chips: the numbers in text, so the radar is never the only carrier. */}
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {SCENT_RADAR_AXES.map((axis, index) => (
          <li
            key={`chip-${axis}`}
            className="rounded-full border border-border-soft bg-surface-2 px-3 py-1 text-xs text-foreground/80"
          >
            <span className="text-muted">{SCENT_RADAR_LABELS[axis]}</span>{" "}
            <span className="tnum font-semibold">
              {toPersianDigits(Math.round(values[index]))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
