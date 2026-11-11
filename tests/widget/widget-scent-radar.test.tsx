import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import WidgetApp, { WidgetResult } from "@/components/widget/WidgetApp";
import {
  SCENT_RADAR_AXES,
  SCENT_RADAR_LABELS,
  radarPoints,
  radarPolygonPoints,
  radarValuesFromVector,
  scentRadarSummary,
} from "@/lib/fragrance/radar";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";
import { toPersianDigits } from "@/lib/persian";
import { makeVector } from "@/tests/ai/fixtures";
import type { PersonalityVector } from "@/types/personality";
import type { WidgetRecommendation } from "@/lib/widget/contract";

/**
 * Batch 41 — the five-axis scent radar inside the widget result.
 *
 * This batch adds NO data plumbing: the widget already scores locally with the
 * shared `scoreQuiz`, so `result.vector` is the shopper's own profile. The pins
 * below prove the radar draws from that vector (not the archetype centroid, not
 * a perfume's profile), that the accessible summary is present in the widget,
 * that the block is absent before the result phase, and that the finished
 * polygon is the default rendering — which is what keeps the radar complete in
 * the auto-sized merchant iframe.
 */

const WIDGET_SOURCE = readFileSync(
  new URL("../../components/widget/WidgetApp.tsx", import.meta.url),
  "utf8",
);
const WIDGET_CODE = WIDGET_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "");
const RADAR_SOURCE = readFileSync(
  new URL("../../components/results/ScentRadar.tsx", import.meta.url),
  "utf8",
);

/** The widget's real result path: the shared scorer over real answers. */
const result = scoreQuiz(
  QUIZ_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: question.options[0].id,
  })),
);

const values = radarValuesFromVector(result.vector);
const summary = scentRadarSummary(values);
const userPolygon = radarPolygonPoints(radarPoints(values, 100));

const MATCHES: WidgetRecommendation[] = [
  {
    perfumeId: "p-1",
    rank: 1,
    name: "عطر یک",
    brand: "برند یک",
    productUrl: "https://shop.example/p/1",
    imageUrl: null,
    price: 1_250_000,
    matchPercent: 91.4,
    matchingProfile: { fresh: 90, warm: 10, mysterious: 40, elegant: 60, bold: 20 },
  },
  {
    perfumeId: "p-2",
    rank: 2,
    name: "عطر دو",
    brand: "برند دو",
    productUrl: null,
    imageUrl: null,
    price: null,
    matchPercent: 78.2,
    matchingProfile: { fresh: 10, warm: 90, mysterious: 60, elegant: 40, bold: 80 },
  },
];

const renderResult = (vector: PersonalityVector = result.vector): string =>
  renderToStaticMarkup(
    <WidgetResult
      storeId="store-A"
      storeSlug="my-shop"
      storeWebsiteUrl="https://shop.example"
      result={{ ...result, vector }}
      data={{ recommendations: MATCHES, aiAvailable: false }}
      onRestart={() => undefined}
    />,
  ).replace(/<!--[\s\S]*?-->/g, "");

const html = renderResult();

describe("widget result — the shared radar", () => {
  it("draws the polygon from the widget's own result vector", () => {
    expect(html).toContain(`points="${userPolygon}"`);
    expect(html).toContain(`aria-label="${summary}"`);
    // The five values are the radar helper's output for THIS vector.
    expect(values).toEqual(
      SCENT_RADAR_AXES.map((axis) => result.vector[axis]),
    );
  });

  it("never draws the archetype centroid instead of the shopper", () => {
    // A vector deliberately different from any archetype centroid.
    const distinct: PersonalityVector = {
      ...makeVector(50),
      fresh: 100,
      warm: 0,
      bold: 50,
      elegant: 25,
      mysterious: 75,
    };
    const distinctPolygon = radarPolygonPoints(
      radarPoints(radarValuesFromVector(distinct), 100),
    );
    const centroidPolygon = radarPolygonPoints(
      radarPoints(radarValuesFromVector(result.archetype.centroid), 100),
    );

    const distinctHtml = renderResult(distinct);

    expect(distinctPolygon).not.toBe(centroidPolygon);
    expect(distinctHtml).toContain(`points="${distinctPolygon}"`);
    expect(distinctHtml).not.toContain(`points="${centroidPolygon}"`);
  });

  it("labels all five matching axes in order and keeps the text chips", () => {
    for (const axis of SCENT_RADAR_AXES) {
      expect(html).toContain(`>${SCENT_RADAR_LABELS[axis]}</text>`);
    }

    SCENT_RADAR_AXES.forEach((axis, index) => {
      const value = toPersianDigits(Math.round(values[index]));
      expect(html).toContain(
        `>${SCENT_RADAR_LABELS[axis]}</span> <span class="tnum font-semibold">${value}</span>`,
      );
    });

    // The picture never carries the numbers alone: the summary is the img's
    // accessible name in the widget exactly as on /result.
    expect(summary).toBe(
      `نمودار رایحه: ${SCENT_RADAR_AXES.map(
        (axis, index) =>
          `${SCENT_RADAR_LABELS[axis]} ${toPersianDigits(Math.round(values[index]))}`,
      ).join("، ")}`,
    );
  });

  it("sits under the archetype and above the recommendation cards", () => {
    const radarAt = html.indexOf(`points="${userPolygon}"`);
    const archetypeAt = html.indexOf(result.archetype.label);
    const firstCardAt = html.indexOf(MATCHES[0].name);

    expect(radarAt).toBeGreaterThan(archetypeAt);
    expect(firstCardAt).toBeGreaterThan(radarAt);
    // The widget adds a width cap, not a second radar.
    expect(WIDGET_SOURCE).toContain('max-w-[340px]');
    expect(WIDGET_SOURCE.match(/<ScentRadar/g) ?? []).toHaveLength(1);
  });

  it("is absent before the result phase", () => {
    const intro = renderToStaticMarkup(<WidgetApp storeId="store-A" />);

    expect(intro).not.toContain("نمودار رایحه");
    expect(intro).not.toContain("scent-radar-grow");
    // The single render site lives in the result view.
    expect(WIDGET_SOURCE.indexOf("<ScentRadar")).toBeGreaterThan(
      WIDGET_SOURCE.indexOf("export function WidgetResult"),
    );
  });
});

describe("widget result — the radar is static and complete by default", () => {
  it("renders the finished polygon with no animation class", () => {
    // Same contract as /result: SSR (and no-JS) is the finished picture.
    expect(html).not.toContain("scent-radar-grow");
    expect(html).toContain('fill-opacity="0.18"');
    // The polygon always carries its points, so the class can only animate —
    // it can never be the difference between a picture and an empty frame.
    expect(RADAR_SOURCE).toContain("className={animate ? \"scent-radar-grow\" : undefined}");
  });

  it("keeps the one-shot visibility grow and its reduced-motion bail-out", () => {
    expect(RADAR_SOURCE).toContain(
      'window.matchMedia("(prefers-reduced-motion: reduce)").matches',
    );
    expect(RADAR_SOURCE).toContain("{ threshold: 0.25 }");
    expect(RADAR_SOURCE).toContain("observer.disconnect()");
  });

  it("observes the section in the iframe's own viewport, with no scroll container", () => {
    // The loader auto-sizes the iframe to its content, so the radar is in the
    // iframe viewport at mount; the observer's root is the default viewport and
    // it watches the section itself. No `root:` means no host-page container can
    // starve the intersection.
    expect(RADAR_SOURCE).toContain("observer.observe(element)");
    expect(RADAR_SOURCE).not.toContain("root:");
    // And even if no callback ever ran, the base markup is the full polygon
    // (the class starts the scale at 0.04; it is never the finished state).
    expect(html).toContain(`points="${userPolygon}"`);
  });

  it("does not add a second fixed width or a horizontal scrollbar", () => {
    expect(WIDGET_CODE).not.toContain("overflow-x");
    // One intended cap, and no other fixed pixel width that could overflow.
    const withoutCap = WIDGET_CODE.replace(/max-w-\[\d+px\]/g, "");
    expect(withoutCap).not.toMatch(/w-\[\d+px\]/);
    // The shared component's own viewBox-driven cap is untouched.
    expect(html).toContain("max-w-[300px]");
  });
});
