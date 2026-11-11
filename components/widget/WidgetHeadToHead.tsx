"use client";

import { useState } from "react";

import ComparisonAxes from "@/components/head-to-head/ComparisonAxes";
import {
  DEFAULT_HEAD_TO_HEAD_PAIR,
  closenessGap,
  pickHeadToHeadPair,
  selectHeadToHeadPair,
  type HeadToHeadPair,
} from "@/lib/head-to-head/comparison";
import { formatPersianScore, toPersianDigits } from "@/lib/persian";
import { withWidgetAttribution } from "@/lib/widget/attribution";
import { trackWidgetPerfumeClick } from "@/lib/widget/click";
import type { WidgetRecommendation } from "@/lib/widget/contract";

/**
 * Batch 40 — batch 39's head-to-head, inside the merchant widget.
 *
 * The same comparison rule and the same axis rows as `/result` (both import
 * `lib/head-to-head/comparison` and `ComparisonAxes`), sized for the loader's
 * 480px frame: a two-column chip grid (the third chip spans the second row),
 * no fixed pixel widths and no horizontal scroll.
 *
 * The numbers are the card's own: the widget prints
 * `formatPersianScore(matchPercent)`, and the difference line uses
 * `Math.round(matchPercent)` on both sides — the same value the widget card
 * prints, never a third number. The five values arrive verbatim from the
 * recommend contract (`matchingProfile`); a payload without them renders zero
 * bars with the perfume's name still shown.
 *
 * Colours come from the widget's existing tokens: the scoped accent for the
 * first perfume and `--wine` for the second, with a legend naming which is
 * which. No new palette, no animation, no client-side timers — the block is
 * complete on the server and under reduced motion.
 */

const FIRST_FILL = {
  backgroundImage:
    "linear-gradient(to right, var(--accent) 0%, color-mix(in srgb, var(--accent) 55%, white) 100%)",
} as const;
const SECOND_FILL = {
  backgroundImage:
    "linear-gradient(to right, var(--wine) 0%, color-mix(in srgb, var(--wine) 60%, white) 100%)",
} as const;
const SIDE_STYLES = [FIRST_FILL, SECOND_FILL] as const;

export default function WidgetHeadToHead({
  recommendations,
  storeId,
  storeSlug = null,
  storeWebsiteUrl = null,
}: {
  recommendations: readonly WidgetRecommendation[];
  storeId: string;
  /** The store's public slug — the campaign tag the merchant can read. */
  storeSlug?: string | null;
  /** The merchant's own site — the fallback destination, exactly like the card. */
  storeWebsiteUrl?: string | null;
}) {
  const [pair, setPair] = useState<HeadToHeadPair>(DEFAULT_HEAD_TO_HEAD_PAIR);

  // Fewer than two perfumes means there is nothing to compare: the block is
  // absent, exactly like /result.
  const selected = selectHeadToHeadPair(recommendations, pair);

  if (!selected) {
    return null;
  }

  const [first, second] = selected;
  const chipCount = Math.min(3, recommendations.length);
  // The card's campaign id: the readable slug when known, else the store id.
  const campaignId = storeSlug && storeSlug !== "" ? storeSlug : storeId;
  const gap = closenessGap(first.matchPercent, second.matchPercent);
  const pairIds = new Set([first.perfumeId, second.perfumeId]);

  /** The card's destination rules, reused: product first, store as fallback. */
  const linkFor = (recommendation: WidgetRecommendation) => {
    if (recommendation.productUrl) {
      return {
        href: withWidgetAttribution(recommendation.productUrl, campaignId),
        isProduct: true,
      };
    }

    if (storeWebsiteUrl) {
      return {
        href: withWidgetAttribution(storeWebsiteUrl, campaignId),
        isProduct: false,
      };
    }

    return null;
  };

  return (
    <section className="flex w-full flex-col gap-4 rounded-[1.5rem] border border-border-soft bg-surface p-4">
      <div className="flex flex-col gap-1">
        <span aria-hidden="true" className="h-px w-10 bg-accent/50" />
        <h2 className="font-heading text-lg font-bold leading-7 text-foreground">
          مقایسهٔ رودررو
        </h2>
        <p className="text-xs leading-7 text-muted">
          دو عطر از سه پیشنهادتون رو انتخاب کنید تا کنار هم ببینیدشون.
        </p>
      </div>

      {/* --- pair picker: two per row, the odd third chip spans the row --- */}
      <div
        role="group"
        aria-label="انتخاب دو عطر برای مقایسه"
        className="grid w-full grid-cols-2 gap-2"
      >
        {recommendations.slice(0, 3).map((recommendation, index) => {
          const pressed = pairIds.has(recommendation.perfumeId);
          const fullRow = index === chipCount - 1 && chipCount % 2 === 1;

          return (
            <button
              key={recommendation.perfumeId}
              type="button"
              data-perfume-id={recommendation.perfumeId}
              aria-pressed={pressed}
              onClick={() =>
                setPair((current) =>
                  pickHeadToHeadPair(current, index, recommendations.length),
                )
              }
              className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent/40 ${
                fullRow ? "col-span-2" : ""
              } ${
                pressed
                  ? "border-accent bg-accent-soft font-medium text-foreground"
                  : "border-border-soft bg-surface-2 text-muted hover:border-accent/40"
              }`}
            >
              <span className="tnum text-xs text-muted">
                {toPersianDigits(recommendation.rank)}
              </span>
              <span className="truncate">{recommendation.name}</span>
            </button>
          );
        })}
      </div>

      {/* --- legend: which colour is which perfume, and its printed index --- */}
      <div dir="ltr" className="grid grid-cols-2 gap-3">
        {[
          { recommendation: first, color: "var(--accent)" },
          { recommendation: second, color: "var(--wine)" },
        ].map((entry) => (
          <div
            key={`legend-${entry.recommendation.perfumeId}`}
            dir="rtl"
            className="flex min-w-0 flex-col gap-1 text-start"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-6 text-foreground">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="truncate">{entry.recommendation.name}</span>
            </span>
            <span className="tnum text-xs text-muted">
              شاخص نزدیکی{" "}
              {formatPersianScore(entry.recommendation.matchPercent)}
            </span>
          </div>
        ))}
      </div>

      <ComparisonAxes first={first} second={second} sideStyles={SIDE_STYLES} />

      <p className="text-sm font-medium text-foreground">
        اختلاف شاخص نزدیکی: <span className="tnum">{toPersianDigits(gap)}</span>
      </p>

      {/* --- the same destinations the cards offer, still tappable --- */}
      <div dir="ltr" className="grid grid-cols-2 gap-2">
        {[first, second].map((recommendation) => {
          const link = linkFor(recommendation);

          if (!link) {
            return null;
          }

          return (
            <a
              key={`link-${recommendation.perfumeId}`}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={
                link.isProduct
                  ? `مشاهده عطر ${recommendation.name}`
                  : `مشاهده در فروشگاه ${recommendation.name}`
              }
              onClick={
                link.isProduct
                  ? () =>
                      trackWidgetPerfumeClick(storeId, recommendation.perfumeId)
                  : undefined
              }
              className="btn-secondary flex min-h-11 min-w-0 items-center justify-center px-3 text-sm font-medium text-foreground hover:text-accent"
            >
              {link.isProduct ? "مشاهده عطر" : "مشاهده در فروشگاه"}
            </a>
          );
        })}
      </div>
    </section>
  );
}
