"use client";

import { BottleMark } from "@/components/ui-icons";
import { trackEvent } from "@/lib/analytics/client";
import { formatPersianScore } from "@/lib/persian";
import type { WidgetRecommendation } from "@/lib/widget/contract";

/**
 * One recommendation inside the widget (Phase 8).
 *
 * Restyled to the main site's card language: a 16:10 artwork panel, the rank
 * chip, a match bar with the «تطابق» label, the explanation block and a button
 * in the shared `.btn-secondary` tier. Every data behaviour of the Phase-8 card
 * is preserved byte-for-byte in intent:
 *
 *  - only customer-safe fields from the widget API (§12);
 *  - the rank badge stays a real `aria-label`'d chip;
 *  - `matchPercent` is displayed as-is (the engine rounds once) and the bar
 *    keeps its accessible progressbar contract;
 *  - the explanation renders only when the AI answered;
 *  - a missing `productUrl` renders NO CTA at all — a fake URL is never
 *    invented (§17), and PERFUME_CLICKED fires on actual clicks only;
 *  - a missing `imageUrl` falls back to `BottleMark`, never to invented
 *    merchant data (the main site's curated artwork is not used here: these
 *    are the merchant's own products).
 */
export default function WidgetRecommendationCard({
  recommendation,
  storeId,
}: {
  recommendation: WidgetRecommendation;
  storeId: string;
}) {
  const { rank, name, brand, productUrl, imageUrl, matchPercent, explanation } = recommendation;

  return (
    <article className="quiz-rise relative flex flex-col overflow-hidden rounded-[1.5rem] border border-border-soft bg-surface shadow-[var(--shadow-card)]">
      {/* --- artwork panel: fixed 16:10 box, so no card changes height --- */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-2">
        {imageUrl ? (
          // Merchant-provided absolute URL; plain <img> keeps it working
          // without a configured image domain.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`تصویر عطر ${name}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center bg-accent-soft"
          >
            <BottleMark className="h-10 w-10 text-accent" />
          </span>
        )}

        <span
          aria-label={`رتبه ${rank}`}
          className="rank-chip tnum absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-accent/40 bg-background/85 text-sm font-bold text-accent shadow-[var(--shadow-card)]"
        >
          {rank}
        </span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-heading text-base font-bold leading-7 text-foreground">{name}</h3>
          <span className="text-sm text-muted">{brand}</span>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={Math.round(matchPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`میزان تطابق ${name}`}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${matchPercent}%`,
                backgroundImage:
                  "linear-gradient(to left, var(--accent) 0%, var(--accent) 55%, color-mix(in srgb, var(--accent) 55%, white) 100%)",
              }}
            />
          </div>
          <span className="tnum shrink-0 text-sm font-semibold text-accent">
            {formatPersianScore(matchPercent)} تطابق
          </span>
        </div>

        {explanation ? (
          <div className="flex flex-col gap-1 rounded-2xl border border-accent/25 bg-accent-soft/60 p-4">
            <span className="text-xs font-semibold text-accent">چرا بهتون میاد؟</span>
            <p className="text-sm leading-8 text-foreground/90">{explanation}</p>
          </div>
        ) : null}

        {productUrl ? (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              // A real click on the merchant's product link (§17).
              void trackEvent({ eventType: "PERFUME_CLICKED", storeId, perfumeId: recommendation.perfumeId });
            }}
            className="btn-secondary flex min-h-11 items-center justify-center px-5 text-sm font-medium text-foreground hover:text-accent"
          >
            مشاهده عطر →
          </a>
        ) : null}
      </div>
    </article>
  );
}
