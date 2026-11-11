import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HeadToHead, {
  DEFAULT_HEAD_TO_HEAD_PAIR,
  axisValueFor,
  closenessGap,
  closenessOf,
  headToHeadOrder,
  pickHeadToHeadPair,
} from "@/components/results/HeadToHead";
import ResultsView from "@/components/results/ResultsView";
import {
  MATCHING_DIMENSIONS,
  type MatchingDimension,
  type MatchingProfileRow,
} from "@/lib/fragrance/profile";
import { SCENT_RADAR_LABELS } from "@/lib/fragrance/radar";
import { matchPerfumes } from "@/lib/matching/engine";
import { getArchetypeById } from "@/lib/personality/archetypes";
import { formatPersianScore, toPersianDigits } from "@/lib/persian";
import type { ResultsViewData } from "@/lib/results/service";
import { makeVector } from "@/tests/ai/fixtures";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { PersonalityVector } from "@/types/personality";
import type { MatchCandidateInput, MatchedPerfume } from "@/types/recommendation";

/**
 * Batch 39 — the head-to-head comparison on /result.
 *
 * The block compares any two of the top three on the five SCENT axes (never the
 * four personality axes, which a perfume has no signal for) and states the
 * difference between the closeness indices the cards already print — the same
 * rounded whole numbers, so a tie really reads 0. Everything here is display:
 * the values come from the engine's pass-through and nothing is re-scored.
 */

const HEAD_SOURCE = readFileSync(
  new URL("../../components/results/HeadToHead.tsx", import.meta.url),
  "utf8",
);
/** The component with its block comments stripped: the prose names the motion
 * this code must not contain. */
const HEAD_CODE = HEAD_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "");
const RESULTS_SOURCE = readFileSync(
  new URL("../../components/results/ResultsView.tsx", import.meta.url),
  "utf8",
);
const CARD_SOURCE = readFileSync(
  new URL("../../components/results/RecommendationCard.tsx", import.meta.url),
  "utf8",
);
/** Batch 40 moved the shared rule here; the results component re-exports it. */
const COMPARISON_SOURCE = readFileSync(
  new URL("../../lib/head-to-head/comparison.ts", import.meta.url),
  "utf8",
);

function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

/** Visible text with the markup stripped. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/** One entry per axis row: the axis id and its accessible name. */
function axisGroups(html: string): Array<{ axis: string; label: string }> {
  return html
    .split('data-axis="')
    .slice(1)
    .map((chunk) => {
      const axis = chunk.slice(0, chunk.indexOf('"'));
      const marker = 'aria-label="';
      const labelAt = chunk.indexOf(marker);
      const label =
        labelAt === -1
          ? ""
          : chunk.slice(
              labelAt + marker.length,
              chunk.indexOf('"', labelAt + marker.length),
            );
      return { axis, label };
    });
}

/** The pair picker's chips: perfume id plus pressed state. */
function chips(html: string): Array<{ id: string; pressed: boolean }> {
  return html
    .split('data-perfume-id="')
    .slice(1)
    .map((chunk) => {
      const id = chunk.slice(0, chunk.indexOf('"'));
      const tag = chunk.slice(0, chunk.indexOf(">"));
      return { id, pressed: tag.includes('aria-pressed="true"') };
    });
}

/** Every painted bar width, in percent, in document order. */
function barWidths(html: string): number[] {
  return (html.match(/style="width:[0-9]+%/g) ?? []).map((match) =>
    Number(match.replace(/[^0-9]/g, "")),
  );
}

/** A complete nine-axis profile with the five matching axes set explicitly. */
function profileWith(values: Record<MatchingDimension, number>): PersonalityVector {
  return {
    ...(Object.fromEntries(
      PERSONALITY_DIMENSIONS.map((dimension) => [dimension, 40]),
    ) as PersonalityVector),
    ...values,
  };
}

const candidate = (
  perfumeId: string,
  name: string,
  values: Record<MatchingDimension, number>,
): MatchCandidateInput => ({
  perfumeId,
  storeId: "store-a",
  name,
  brand: "خانهٔ آزمون",
  slug: perfumeId,
  productUrl: null,
  imageUrl: null,
  active: true,
  inStock: true,
  profile: profileWith(values),
});

const vector = makeVector(50);
const engineResult = matchPerfumes({
  personalityVector: vector,
  perfumes: [
    candidate("a", "عطر آلفا", {
      fresh: 90,
      warm: 10,
      mysterious: 40,
      elegant: 60,
      bold: 20,
    }),
    candidate("b", "عطر بتا", {
      fresh: 10,
      warm: 90,
      mysterious: 60,
      elegant: 40,
      bold: 80,
    }),
    candidate("c", "عطر گاما", {
      fresh: 55,
      warm: 45,
      mysterious: 70,
      elegant: 30,
      bold: 65,
    }),
  ],
  topN: 3,
});
const recommendations = engineResult.recommendations;
const html = render(<HeadToHead recommendations={recommendations} />);
const first = recommendations[0];
const second = recommendations[1];

const viewData = (overrides: Partial<ResultsViewData> = {}): ResultsViewData => ({
  recommendations,
  explanations: new Map(),
  aiAvailable: false,
  isEmpty: false,
  ...overrides,
});
const archetype = getArchetypeById("mysterious-explorer")!;

describe("head-to-head — the five axes, side by side", () => {
  it("renders exactly the five matching axes, in MATCHING_DIMENSIONS order", () => {
    const groups = axisGroups(html);

    expect(groups.map((group) => group.axis)).toEqual([...MATCHING_DIMENSIONS]);
    for (const [index, axis] of MATCHING_DIMENSIONS.entries()) {
      expect(groups[index].label).toContain(SCENT_RADAR_LABELS[axis]);
    }
  });

  it("shows both perfumes' own threaded values, never the user's vector", () => {
    const groups = axisGroups(html);

    for (const [index, axis] of MATCHING_DIMENSIONS.entries()) {
      const left = first.matchingProfile![axis];
      const right = second.matchingProfile![axis];

      expect(groups[index].label).toContain(
        `${first.name} ${toPersianDigits(left)}`,
      );
      expect(groups[index].label).toContain(
        `${second.name} ${toPersianDigits(right)}`,
      );
      // The shopper's vector is 50 on every axis; none of the perfume bars may
      // echo it. The block compares perfumes, not the shopper.
      expect(groups[index].label).not.toContain("۵۰");
    }

    // Painted lengths are those same values, first perfume then second.
    expect(barWidths(html)).toEqual(
      MATCHING_DIMENSIONS.flatMap((axis) => [
        first.matchingProfile![axis],
        second.matchingProfile![axis],
      ]),
    );
  });

  it("never mentions a personality axis", () => {
    const axes = axisGroups(html).map((group) => group.axis);

    for (const personalityOnly of [
      "social",
      "adventurous",
      "expressive",
      "experimental",
    ]) {
      expect(axes).not.toContain(personalityOnly);
      expect(HEAD_SOURCE).not.toContain(`"${personalityOnly}"`);
    }
  });
});

describe("head-to-head — the closeness difference", () => {
  it("equals the absolute difference of the two cards' printed whole numbers", () => {
    const expected = Math.abs(
      Math.round(first.presentationScore) - Math.round(second.presentationScore),
    );

    expect(textOf(html)).toContain(
      `اختلاف شاخص نزدیکی: ${toPersianDigits(expected)}`,
    );

    // Each header repeats its card's own printed index.
    for (const recommendation of [first, second]) {
      expect(textOf(html)).toContain(
        `شاخص نزدیکی ${formatPersianScore(recommendation.presentationScore)}`,
      );
    }
  });

  it("reads 0 when the two perfumes display the same index", () => {
    const tied: MatchedPerfume[] = [
      { ...first, presentationScore: 87.4 },
      { ...second, presentationScore: 87.2 },
    ];

    expect(closenessGap(87.4, 87.2)).toBe(0);
    expect(closenessGap(92.5, 89.6)).toBe(3);

    const tiedHtml = render(<HeadToHead recommendations={tied} />);
    expect(textOf(tiedHtml)).toContain("اختلاف شاخص نزدیکی: ۰");
  });

  it("shares one rounding rule with the cards", () => {
    for (const score of [92.4, 89.6, 92.5, 78.2, 100, 0]) {
      expect(closenessOf(score)).toBe(Math.round(score));
    }

    expect(CARD_SOURCE).toContain("const closeness = Math.round(presentationScore);");
    // Batch 40 extracted this rule; the pin follows the behaviour to its new
    // home, which the results component re-exports unchanged.
    expect(COMPARISON_SOURCE).toContain("return Math.round(presentationScore);");
  });
});

describe("head-to-head — the pair picker", () => {
  it("defaults to ranks 1 and 2, with exactly two chips pressed", () => {
    expect(DEFAULT_HEAD_TO_HEAD_PAIR).toEqual({ first: 0, second: 1 });

    const rendered = chips(html);
    expect(rendered).toHaveLength(3);
    expect(rendered.filter((chip) => chip.pressed).map((chip) => chip.id)).toEqual([
      first.perfumeId,
      second.perfumeId,
    ]);
  });

  it("swaps one perfume at a time and never selects fewer than two", () => {
    const third = recommendations[2];
    const swapped = pickHeadToHeadPair(DEFAULT_HEAD_TO_HEAD_PAIR, 2, 3);

    // The most recent pick survives; the older slot is the one that changes.
    expect(swapped).toEqual({ first: 1, second: 2 });
    expect(headToHeadOrder(swapped)).toEqual([1, 2]);
    expect(swapped.first).not.toBe(swapped.second);

    // Tapping an already-selected chip, or an index outside the list, does
    // nothing — the pair can never drop below two.
    expect(pickHeadToHeadPair(swapped, 1, 3)).toBe(swapped);
    expect(pickHeadToHeadPair(swapped, 2, 3)).toBe(swapped);
    expect(pickHeadToHeadPair(swapped, 5, 3)).toBe(swapped);
    expect(pickHeadToHeadPair(swapped, -1, 3)).toBe(swapped);

    // From any pair, every tap yields two distinct, in-range slots.
    for (const start of [
      DEFAULT_HEAD_TO_HEAD_PAIR,
      swapped,
      { first: 2, second: 0 },
    ]) {
      for (const index of [0, 1, 2, 3, -1]) {
        const next = pickHeadToHeadPair(start, index, 3);
        const [left, right] = headToHeadOrder(next);
        const ids = [recommendations[left].perfumeId, recommendations[right].perfumeId];

        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThan(recommendations.length);
        expect(left).not.toBe(right);
        expect(new Set(ids).size).toBe(2);
      }
    }

    expect(third.perfumeId).toBe(recommendations[2].perfumeId);
  });
});

describe("head-to-head — absence and resilience", () => {
  it("is absent on an empty result and with a single recommendation", () => {
    expect(render(<HeadToHead recommendations={[]} />)).not.toContain(
      "مقایسهٔ رودررو",
    );
    expect(
      render(<HeadToHead recommendations={recommendations.slice(0, 1)} />),
    ).not.toContain("مقایسهٔ رودررو");
  });

  it("sits after the recommendations and before the answer decode", () => {
    const withBlock = render(
      <ResultsView vector={vector} archetype={archetype} data={viewData()} />,
    );
    expect(withBlock).toContain("مقایسهٔ رودررو");

    const recommendationsEnd = RESULTS_SOURCE.indexOf("</StagedReveal>");
    const blockAt = RESULTS_SOURCE.indexOf("<HeadToHead");
    const decodeAt = RESULTS_SOURCE.indexOf("<AnswerDecode");

    expect(blockAt).toBeGreaterThan(recommendationsEnd);
    expect(decodeAt).toBeGreaterThan(blockAt);
  });

  it("hides itself on the results screen's empty and single states", () => {
    const empty = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData({ recommendations: [], isEmpty: true })}
      />,
    );
    const single = render(
      <ResultsView
        vector={vector}
        archetype={archetype}
        data={viewData({ recommendations: recommendations.slice(0, 1) })}
      />,
    );

    expect(empty).not.toContain("مقایسهٔ رودررو");
    expect(single).not.toContain("مقایسهٔ رودررو");
  });

  it("renders zeros for a recommendation without threaded values, without throwing", () => {
    const stripped = recommendations.slice(0, 2).map((recommendation) => ({
      ...recommendation,
      matchingProfile: undefined,
    }));

    const strippedHtml = render(<HeadToHead recommendations={stripped} />);
    const groups = axisGroups(strippedHtml);

    expect(groups).toHaveLength(MATCHING_DIMENSIONS.length);
    for (const group of groups) {
      expect(group.label).toContain(`${stripped[0].name} ۰`);
      expect(group.label).toContain(`${stripped[1].name} ۰`);
    }
    expect(textOf(strippedHtml)).toContain(stripped[0].name);
    expect(barWidths(strippedHtml)).toEqual(
      new Array(MATCHING_DIMENSIONS.length * 2).fill(0),
    );

    expect(axisValueFor(undefined, "fresh")).toBe(0);
    expect(axisValueFor(null, "bold")).toBe(0);
    // Out-of-range values are clamped, never borrowed or overflowing.
    expect(axisValueFor({ fresh: 140 } as MatchingProfileRow, "fresh")).toBe(100);
    expect(axisValueFor({ fresh: -20 } as MatchingProfileRow, "fresh")).toBe(0);
  });
});

describe("head-to-head — static by construction", () => {
  it("introduces no animation, so there is no motion gate to get wrong", () => {
    expect(HEAD_SOURCE.startsWith('"use client";')).toBe(true);
    expect(HEAD_CODE).not.toContain("transition-");
    for (const forbidden of [
      "animation",
      "@keyframes",
      "useEffect",
      "setTimeout",
      "setInterval",
    ]) {
      expect(HEAD_CODE).not.toContain(forbidden);
    }

    expect(html).not.toContain("quiz-rise");
    expect(html).not.toContain("animation");
    expect(html).not.toContain("<style");
    // Every bar is rendered complete: SSR is also the reduced-motion look.
    expect(barWidths(html)).toHaveLength(MATCHING_DIMENSIONS.length * 2);
  });

  it("keeps the numbers in the accessible name, not only in the paint", () => {
    const groups = axisGroups(html);

    for (const group of groups) {
      expect(group.label).toContain(first.name);
      expect(group.label).toContain(second.name);
    }
    // The picker is a labelled group of real toggle buttons.
    expect(html).toContain('role="group" aria-label="انتخاب دو عطر برای مقایسه"');
    expect(html.match(/aria-pressed=/g) ?? []).toHaveLength(3);
  });
});
