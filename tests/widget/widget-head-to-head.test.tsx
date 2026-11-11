import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import WidgetHeadToHead from "@/components/widget/WidgetHeadToHead";
import * as ResultBlock from "@/components/results/HeadToHead";
import * as Shared from "@/lib/head-to-head/comparison";
import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import { SCENT_RADAR_LABELS } from "@/lib/fragrance/radar";
import { formatPersianScore, toPersianDigits } from "@/lib/persian";
import { trackWidgetPerfumeClick } from "@/lib/widget/click";
import type { WidgetRecommendation } from "@/lib/widget/contract";

/**
 * Batch 40 — batch 39's head-to-head inside the merchant widget.
 *
 * The widget must run the SAME rule as `/result`: one shared comparison module,
 * one shared axis-row component. The numbers are the widget card's own
 * (`matchPercent` is the engine's presentation score, printed as
 * `formatPersianScore`), so the difference line can never show a gap the two
 * cards do not. The product links stay real links through the existing click
 * path, and a payload without the threaded values renders zeros instead of
 * guessing.
 */

const WIDGET_SOURCE = readFileSync(
  new URL("../../components/widget/WidgetHeadToHead.tsx", import.meta.url),
  "utf8",
);
const WIDGET_CODE = WIDGET_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "");
const AXES_SOURCE = readFileSync(
  new URL("../../components/head-to-head/ComparisonAxes.tsx", import.meta.url),
  "utf8",
);
/** Prose names the motion this code must not contain. */
const AXES_CODE = AXES_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "");
const RESULT_SOURCE = readFileSync(
  new URL("../../components/results/HeadToHead.tsx", import.meta.url),
  "utf8",
);
const CARD_SOURCE = readFileSync(
  new URL("../../components/widget/WidgetRecommendationCard.tsx", import.meta.url),
  "utf8",
);
const CLICK_SOURCE = readFileSync(
  new URL("../../lib/widget/click.ts", import.meta.url),
  "utf8",
);

function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function axisGroups(html: string): Array<{ axis: string; label: string }> {
  return html
    .split('data-axis="')
    .slice(1)
    .map((chunk) => {
      const axis = chunk.slice(0, chunk.indexOf('"'));
      const marker = 'aria-label="';
      const labelAt = chunk.indexOf(marker);
      return {
        axis,
        label:
          labelAt === -1
            ? ""
            : chunk.slice(
                labelAt + marker.length,
                chunk.indexOf('"', labelAt + marker.length),
              ),
      };
    });
}

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

function barWidths(html: string): number[] {
  return (html.match(/style="width:[0-9]+%/g) ?? []).map((match) =>
    Number(match.replace(/[^0-9]/g, "")),
  );
}

const MATCHES: readonly WidgetRecommendation[] = [
  {
    perfumeId: "p-1",
    rank: 1,
    name: "عطر یک",
    brand: "برند یک",
    productUrl: "https://shop.example/p/1",
    imageUrl: "https://shop.example/p/1.jpg",
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
  {
    perfumeId: "p-3",
    rank: 3,
    name: "عطر سه",
    brand: "برند سه",
    productUrl: null,
    imageUrl: null,
    price: 0,
    matchPercent: 64,
    matchingProfile: { fresh: 55, warm: 45, mysterious: 70, elegant: 30, bold: 65 },
  },
];

const renderBlock = (
  recommendations: readonly WidgetRecommendation[] = MATCHES,
): string =>
  render(
    <WidgetHeadToHead
      recommendations={recommendations}
      storeId="store-A"
      storeWebsiteUrl="https://shop.example"
    />,
  );

const html = renderBlock();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("widget head-to-head — the same rule as /result", () => {
  it("renders the five matching axes in order with both real values", () => {
    const groups = axisGroups(html);
    const [first, second] = MATCHES;

    expect(groups.map((group) => group.axis)).toEqual([...MATCHING_DIMENSIONS]);
    for (const [index, axis] of MATCHING_DIMENSIONS.entries()) {
      expect(groups[index].label).toContain(SCENT_RADAR_LABELS[axis]);
      expect(groups[index].label).toContain(
        `${first.name} ${toPersianDigits(first.matchingProfile![axis])}`,
      );
      expect(groups[index].label).toContain(
        `${second.name} ${toPersianDigits(second.matchingProfile![axis])}`,
      );
    }

    expect(barWidths(html)).toEqual(
      MATCHING_DIMENSIONS.flatMap((axis) => [
        first.matchingProfile![axis],
        second.matchingProfile![axis],
      ]),
    );
    // The personality axes never appear — same honesty rule as the radar.
    for (const personalityOnly of [
      "social",
      "adventurous",
      "expressive",
      "experimental",
    ]) {
      expect(groups.map((group) => group.axis)).not.toContain(personalityOnly);
    }
  });

  it("shares one implementation with the results page, not a fork", () => {
    expect(ResultBlock.pickHeadToHeadPair).toBe(Shared.pickHeadToHeadPair);
    expect(ResultBlock.closenessOf).toBe(Shared.closenessOf);
    expect(ResultBlock.DEFAULT_HEAD_TO_HEAD_PAIR).toBe(
      Shared.DEFAULT_HEAD_TO_HEAD_PAIR,
    );

    // The axis rows exist once, in the shared component…
    expect(AXES_SOURCE).toContain('data-axis={axis}');
    expect(WIDGET_SOURCE).not.toContain("data-axis=");
    expect(RESULT_SOURCE).not.toContain("data-axis=");

    // …and both surfaces import it instead of drawing their own bars.
    for (const source of [WIDGET_SOURCE, RESULT_SOURCE]) {
      expect(source).toContain('from "@/components/head-to-head/ComparisonAxes"');
      expect(source).toContain('from "@/lib/head-to-head/comparison"');
    }
  });

  it("states the difference of the two printed whole numbers", () => {
    // 91.4 prints ۹۱, 78.2 prints ۷۸ — the same numbers the widget cards show.
    const expected = Math.abs(
      Math.round(MATCHES[0].matchPercent) - Math.round(MATCHES[1].matchPercent),
    );

    expect(expected).toBe(13);
    expect(textOf(html)).toContain(
      `اختلاف شاخص نزدیکی: ${toPersianDigits(expected)}`,
    );
    for (const recommendation of MATCHES.slice(0, 2)) {
      expect(textOf(html)).toContain(
        `شاخص نزدیکی ${formatPersianScore(recommendation.matchPercent)}`,
      );
    }
  });

  it("reads 0 when the two perfumes display the same index", () => {
    const tied: WidgetRecommendation[] = [
      { ...MATCHES[0], matchPercent: 91.4 },
      { ...MATCHES[1], matchPercent: 91.2 },
    ];

    expect(Shared.closenessGap(91.4, 91.2)).toBe(0);
    expect(textOf(renderBlock(tied))).toContain("اختلاف شاخص نزدیکی: ۰");
  });
});

describe("widget head-to-head — the pair picker", () => {
  it("defaults to ranks 1–2 with exactly two chips pressed", () => {
    const rendered = chips(html);

    expect(Shared.DEFAULT_HEAD_TO_HEAD_PAIR).toEqual({ first: 0, second: 1 });
    expect(rendered).toHaveLength(3);
    expect(rendered.filter((chip) => chip.pressed).map((chip) => chip.id)).toEqual([
      "p-1",
      "p-2",
    ]);
  });

  it("keeps batch 39's swap semantics: one swap, never fewer than two", () => {
    const swapped = Shared.pickHeadToHeadPair(
      Shared.DEFAULT_HEAD_TO_HEAD_PAIR,
      2,
      3,
    );

    expect(swapped).toEqual({ first: 1, second: 2 });
    expect(Shared.pickHeadToHeadPair(swapped, 1, 3)).toBe(swapped);
    expect(Shared.pickHeadToHeadPair(swapped, 2, 3)).toBe(swapped);
    expect(Shared.pickHeadToHeadPair(swapped, 7, 3)).toBe(swapped);

    const [left, right] = Shared.headToHeadOrder(swapped);
    expect(left).not.toBe(right);
    expect(new Set([left, right]).size).toBe(2);
  });
});

describe("widget head-to-head — absence and fallbacks", () => {
  it("is absent with fewer than two recommendations", () => {
    expect(renderBlock([])).not.toContain("مقایسهٔ رودررو");
    expect(renderBlock(MATCHES.slice(0, 1))).not.toContain("مقایسهٔ رودررو");
  });

  it("renders zero bars, names intact, when the payload has no matching values", () => {
    const stripped = MATCHES.slice(0, 2).map((recommendation) => ({
      ...recommendation,
      matchingProfile: undefined,
    }));
    const strippedHtml = renderBlock(stripped);
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
  });
});

describe("widget head-to-head — destinations and analytics", () => {
  it("keeps the product link real and the store as the honest fallback", () => {
    // Rank 1 has a product URL; rank 2 does not, so it uses the store site.
    expect(html).toContain(
      'href="https://shop.example/p/1?utm_source=fiage_widget&amp;utm_medium=quiz&amp;utm_campaign=store-A"',
    );
    expect(html).toContain(
      'href="https://shop.example?utm_source=fiage_widget&amp;utm_medium=quiz&amp;utm_campaign=store-A"',
    );
    expect(html).toContain('aria-label="مشاهده عطر عطر یک"');
    expect(html).toContain('aria-label="مشاهده در فروشگاه عطر دو"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("uses the widget's one click path for product links", () => {
    // Same helper in the card and the comparison — no second event shape.
    expect(CARD_SOURCE).toContain(
      "trackWidgetPerfumeClick(storeId, recommendation.perfumeId)",
    );
    expect(WIDGET_SOURCE).toContain(
      "trackWidgetPerfumeClick(storeId, recommendation.perfumeId)",
    );
    expect(CLICK_SOURCE).toContain('eventType: "PERFUME_CLICKED"');
  });

  it("fires exactly one PERFUME_CLICKED for a click, with the store context", async () => {
    const fetchMock = vi.fn(
      async (_input: unknown, _init?: RequestInit) => ({ ok: true }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    trackWidgetPerfumeClick("store-A", "p-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload).toMatchObject({
      eventType: "PERFUME_CLICKED",
      storeId: "store-A",
      perfumeId: "p-1",
    });
  });
});

describe("widget head-to-head — fits the 480px frame", () => {
  it("wraps instead of scrolling and uses no fixed pixel widths", () => {
    expect(WIDGET_CODE).toContain("grid-cols-2");
    expect(WIDGET_CODE).toContain("col-span-2");
    expect(WIDGET_CODE).not.toMatch(/w-\[\d+px\]|min-w-\[\d+px\]|overflow-x/);
    expect(WIDGET_SOURCE).not.toContain("overflow-x");
    // The chips can truncate long names rather than push the row wider.
    expect(WIDGET_CODE).toContain("min-w-0");
    expect(WIDGET_CODE).toContain("truncate");
  });

  it("is static: no animation, no transition, no timers", () => {
    for (const forbidden of [
      "animation",
      "@keyframes",
      "transition-",
      "useEffect",
      "setTimeout",
      "setInterval",
    ]) {
      expect(WIDGET_CODE).not.toContain(forbidden);
      expect(AXES_CODE).not.toContain(forbidden);
    }

    expect(html).not.toContain("quiz-rise");
    expect(html).not.toContain("animation");
    expect(html).not.toContain("<style");
    // Every bar is painted at its full length in the markup.
    expect(barWidths(html)).toHaveLength(MATCHING_DIMENSIONS.length * 2);
  });

  it("names both colours in the legend and both values in each group", () => {
    // Two legend swatches, one per perfume, each followed by its name.
    expect(html.match(/rounded-full" style="background-color:var\(--/g) ?? []).toHaveLength(2);
    expect(html).toContain("var(--accent)");
    expect(html).toContain("var(--wine)");

    for (const group of axisGroups(html)) {
      expect(group.label).toContain(MATCHES[0].name);
      expect(group.label).toContain(MATCHES[1].name);
    }
    expect(html).toContain('role="group" aria-label="انتخاب دو عطر برای مقایسه"');
    expect(html.match(/aria-pressed=/g) ?? []).toHaveLength(3);
  });
});
