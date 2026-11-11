import type { CSSProperties } from "react";

import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import { SCENT_RADAR_LABELS } from "@/lib/fragrance/radar";
import {
  axisValueFor,
  type HeadToHeadSubject,
} from "@/lib/head-to-head/comparison";
import { toPersianDigits } from "@/lib/persian";

/**
 * The head-to-head axis rows, shared by `/result` (batch 39) and the embedded
 * widget (batch 40).
 *
 * Five rows in `MATCHING_DIMENSIONS` order, each with two bars: the first
 * perfume on the left, the second on the right, values in Persian digits. The
 * row is a labelled group naming the axis and both perfumes' numbers, so the
 * picture is never the only carrier of the values. The bars are pure paint
 * (`aria-hidden`); their colours come from the caller, so each surface keeps
 * its own palette while the geometry and the numbers stay identical.
 *
 * No state, no effects, no animation: it renders complete on the server and
 * under `prefers-reduced-motion`.
 */
export default function ComparisonAxes({
  first,
  second,
  sideStyles,
}: {
  first: HeadToHeadSubject;
  second: HeadToHeadSubject;
  /** One bar paint per side: [first perfume, second perfume]. */
  sideStyles: readonly [CSSProperties, CSSProperties];
}) {
  return (
    <div className="flex flex-col gap-4">
      {MATCHING_DIMENSIONS.map((axis) => {
        const label = SCENT_RADAR_LABELS[axis];
        const leftValue = axisValueFor(first.matchingProfile, axis);
        const rightValue = axisValueFor(second.matchingProfile, axis);

        return (
          <div
            key={axis}
            data-axis={axis}
            role="group"
            aria-label={`${label}؛ ${first.name} ${toPersianDigits(leftValue)}، ${second.name} ${toPersianDigits(rightValue)}`}
            className="flex flex-col gap-2"
          >
            <span className="text-center text-xs font-medium text-muted">
              {label}
            </span>
            <div dir="ltr" className="grid grid-cols-2 gap-4">
              {[
                {
                  recommendation: first,
                  value: leftValue,
                  side: "first" as const,
                  paint: sideStyles[0],
                },
                {
                  recommendation: second,
                  value: rightValue,
                  side: "second" as const,
                  paint: sideStyles[1],
                },
              ].map((entry) => (
                <div
                  key={`${axis}-${entry.side}`}
                  data-side={entry.side}
                  className="flex flex-col gap-1"
                >
                  <span className="tnum text-xs font-semibold text-foreground">
                    {toPersianDigits(entry.value)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="block h-2 w-full overflow-hidden rounded-full bg-surface-2"
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${entry.value}%`,
                        ...entry.paint,
                      }}
                    />
                  </span>
                  <span className="sr-only">
                    {entry.recommendation.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
