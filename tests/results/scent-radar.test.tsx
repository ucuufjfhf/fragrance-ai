import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ResultsView from "@/components/results/ResultsView";
import {
  SCENT_RADAR_AXES,
  SCENT_RADAR_GRID_RINGS,
  SCENT_RADAR_LABELS,
  radarPointAt,
  radarPoints,
  radarPolygonPoints,
  radarValuesFromVector,
  scentRadarSummary,
} from "@/lib/fragrance/radar";
import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import { getArchetypeById } from "@/lib/personality/archetypes";
import { buildShareCardModel } from "@/lib/results/share-card";
import { buildShareCardLayout } from "@/lib/results/share-card-painter";
import type { ResultsViewData } from "@/lib/results/service";
import { makeMatchResult, makeVector } from "@/tests/ai/fixtures";
import type { PersonalityVector } from "@/types/personality";

/**
 * Batch 37 — the five-axis scent radar, on /result and on the share card.
 *
 * Both consumers draw from `lib/fragrance/radar.ts`, so these pins sit on that
 * one module: the axis set must equal the engine's `MATCHING_DIMENSIONS` (a
 * future sixth matching axis fails here), the geometry must match hand-computed
 * vertices, and the page/card must carry the USER's five values — not the
 * archetype's centroid and not a perfume's profile.
 */

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const PAINTER_SOURCE = readFileSync(
  new URL("../../lib/results/share-card-painter.ts", import.meta.url),
  "utf8",
);

const archetype = getArchetypeById("bold-one")!;

/** Five deliberately distinct values, so a wrong source is obvious. */
const VECTOR = {
  ...makeVector(50),
  fresh: 100,
  warm: 0,
  bold: 50,
  elegant: 25,
  mysterious: 75,
} as PersonalityVector;

const viewData = (): ResultsViewData => ({
  recommendations: makeMatchResult().recommendations,
  explanations: new Map(),
  aiAvailable: true,
  isEmpty: false,
});

const render = (): string =>
  renderToStaticMarkup(
    <ResultsView vector={VECTOR} archetype={archetype} data={viewData()} />,
  ).replace(/<!--[\s\S]*?-->/g, "");

describe("scent radar — axes", () => {
  it("draws exactly the five matching axes", () => {
    // Set equality against the imported constant: a sixth matching axis fails.
    expect(new Set(SCENT_RADAR_AXES)).toEqual(new Set(MATCHING_DIMENSIONS));
    expect(SCENT_RADAR_AXES).toHaveLength(5);
    // Fixed clockwise order, starting at the top — the approved sample.
    expect(SCENT_RADAR_AXES).toEqual(["fresh", "warm", "bold", "elegant", "mysterious"]);
  });

  it("never draws a personality-only axis", () => {
    for (const axis of ["social", "adventurous", "expressive", "experimental"]) {
      expect(SCENT_RADAR_AXES as readonly string[]).not.toContain(axis);
    }
  });

  it("labels the axes in the sample's wording, with the 25/50/75/100 rings", () => {
    expect(SCENT_RADAR_AXES.map((axis) => SCENT_RADAR_LABELS[axis])).toEqual([
      "تازه",
      "گرم",
      "جسور",
      "شیک",
      "مرموز",
    ]);
    expect([...SCENT_RADAR_GRID_RINGS]).toEqual([25, 50, 75, 100]);
  });
});

describe("scent radar — geometry", () => {
  it("places a full polygon at the hand-computed five vertices", () => {
    const points = radarPoints([100, 100, 100, 100, 100], 100);

    // Clockwise from the top: −90°, −18°, 54°, 126°, 198°.
    const expected = [
      [0, -100],
      [95.11, -30.9],
      [58.78, 80.9],
      [-58.78, 80.9],
      [-95.11, -30.9],
    ];

    points.forEach((point, index) => {
      expect(point.x, `vertex ${index} x`).toBeCloseTo(expected[index][0], 1);
      expect(point.y, `vertex ${index} y`).toBeCloseTo(expected[index][1], 1);
    });
  });

  it("collapses to the centre at 0 and scales linearly in between", () => {
    for (const point of radarPoints([0, 0, 0, 0, 0], 100)) {
      expect(point.x).toBeCloseTo(0, 6);
      expect(point.y).toBeCloseTo(0, 6);
    }

    const mixed = radarPoints([100, 0, 50, 0, 100], 100);
    expect(mixed[0].y).toBeCloseTo(-100, 6);
    expect(mixed[1]).toEqual({ x: 0, y: 0 });
    expect(mixed[2].x).toBeCloseTo(29.39, 1);
    expect(mixed[2].y).toBeCloseTo(40.45, 1);
    expect(mixed[3]).toEqual({ x: 0, y: 0 });
    expect(mixed[4].x).toBeCloseTo(-95.11, 1);
  });

  it("clamps values into 0–100 instead of drawing outside the grid", () => {
    expect(radarPointAt(0, 140, 100).y).toBeCloseTo(-100, 6);
    expect(radarPointAt(0, -25, 100).y).toBeCloseTo(0, 6);
    expect(radarPointAt(0, Number.NaN, 100).y).toBeCloseTo(0, 6);
  });

  it("summarises every axis with its own value, in Persian digits", () => {
    const summary = scentRadarSummary(radarValuesFromVector(VECTOR));

    expect(summary).toBe("نمودار رایحه: تازه ۱۰۰، گرم ۰، جسور ۵۰، شیک ۲۵، مرموز ۷۵");
  });
});

describe("scent radar — /result profile section", () => {
  const html = render();

  it("renders the shopper's own five values, not the archetype's", () => {
    const values = radarValuesFromVector(VECTOR);
    const userPolygon = radarPolygonPoints(radarPoints(values, 100));
    const archetypePolygon = radarPolygonPoints(
      radarPoints(radarValuesFromVector(archetype.centroid), 100),
    );

    expect(html).toContain('role="img"');
    expect(html).toContain(scentRadarSummary(values));
    expect(html).toContain(`points="${userPolygon}"`);
    // The archetype's centroid is a different pentagon — it must not be drawn.
    expect(archetypePolygon).not.toBe(userPolygon);
    expect(html).not.toContain(`points="${archetypePolygon}"`);
  });

  it("keeps the value chips and the trait bars, so the radar is never alone", () => {
    // Five chips, one per matching axis, with the same Persian digits.
    for (const [axis, value] of [
      ["تازه", "۱۰۰"],
      ["گرم", "۰"],
      ["جسور", "۵۰"],
      ["شیک", "۲۵"],
      ["مرموز", "۷۵"],
    ] as const) {
      expect(html).toContain(`>${axis}</span> <span class="tnum font-semibold">${value}</span>`);
    }
    // The detail stays: nine personality bars are still rendered.
    expect((html.match(/role="progressbar"/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });

  it("renders the full polygon statically, with no animation class", () => {
    // SSR (and no-JS) is the finished picture; the class is added after mount by
    // the observer, and never for reduced motion.
    expect(html).not.toContain("scent-radar-grow");
    expect(CSS).toContain(".scent-radar-grow {");
    expect(CSS).toContain("@keyframes scent-radar-grow {");
    const reducedAt = CSS.indexOf(
      "@media (prefers-reduced-motion: reduce) {\n  .scent-radar-grow {",
    );
    expect(reducedAt, "no reduced-motion gate on the radar").toBeGreaterThan(-1);
    expect(CSS.slice(reducedAt)).toContain("animation: none;");
    // One pass, in the trait bars' duration family.
    expect(CSS).toContain("animation: scent-radar-grow 900ms cubic-bezier(0.22, 1, 0.36, 1) both;");
  });
});

describe("scent radar — share card", () => {
  const pick = {
    name: "نویر آزمون",
    brand: "خانه آزمون",
    presentationScore: 92.4,
    imageUrl: "/perfumes/perfume-01.jpg",
  };
  const model = buildShareCardModel(archetype, pick, VECTOR);

  it("carries the same five values the page draws", () => {
    expect(model.radar.values).toEqual(radarValuesFromVector(VECTOR));
    expect(model.radar.axes).toEqual(SCENT_RADAR_AXES);
    expect(model.radar.summary).toBe(scentRadarSummary(radarValuesFromVector(VECTOR)));
  });

  it("draws from the shared geometry module, not a second implementation", () => {
    expect(PAINTER_SOURCE).toContain('from "@/lib/fragrance/radar"');
    expect(PAINTER_SOURCE).toContain("radarPoints(model.radar.values");
    expect(PAINTER_SOURCE).toContain("radarLabelPoint(index, labelRadius");
    // No local trig: the only cos/sin live in the shared module.
    expect(PAINTER_SOURCE).not.toContain("Math.cos");
    expect(PAINTER_SOURCE).not.toContain("Math.sin");
  });

  it("keeps the card 1080×1350 and the rebalanced layout", () => {
    const layout = buildShareCardLayout(model, { hasBottleImage: true });

    expect(layout.width).toBe(1080);
    expect(layout.height).toBe(1350);
    // The medallion shrank to make room for the radar; the radar sits between
    // the description and the divider; the top block moved down.
    expect(layout.medallion.radius).toBe(78);
    expect(layout.radar).toEqual({ x: 540, y: 830, radius: 82, labelRadius: 106 });
    expect(layout.description.y).toBe(574);
    expect(layout.divider.y).toBe(962);
    expect(layout.topPick!.y).toBe(1008);
    // Batch-36 behaviour is intact: multiply bottle on the left, text right.
    expect(layout.topPick!.composite).toBe("multiply");
    expect(layout.topPick!.align).toBe("right");
    expect(layout.topPick!.bottle!.x).toBeLessThan(540);
  });
});
