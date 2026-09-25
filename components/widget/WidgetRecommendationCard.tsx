"use client";

import { BottleMark } from "@/components/ui-icons";
import { trackEvent } from "@/lib/analytics/client";
import { formatPersianScore } from "@/lib/persian";
import type { WidgetRecommendation } from "@/lib/widget/contract";

/**
 * One recommendation inside the widget (Phase 8).
 *
 * Renders only customer-safe fields from the widget API (§12). A missing
 * productUrl renders no CTA at all — a fake URL is never invented (§17).
 * PERFUME_CLICKED fires on actual clicks only, carrying the widget's store
 * context and the minimum identifier needed for analytics.
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
    <article className="flex flex-col gap-3 rounded-3xl border border-border-soft bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {imageUrl ? (
            // Merchant-provided absolute URL; fixed box prevents layout shift.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`تصویر عطر ${name}`}
              width={56}
              height={56}
              loading="lazy"
              className="h-14 w-14 shrink-0 rounded-2xl border border-border-soft object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border-soft bg-accent-soft text-2xl"
            >
              <BottleMark className="h-6 w-6" />
            </span>
          )}

          <div className="flex flex-col gap-0.5">
            <h3 className="text-base font-bold leading-7 text-foreground">{name}</h3>
            <span className="text-sm text-muted">{brand}</span>
          </div>
        </div>

        <span
          aria-label={`رتبه ${rank}`}
          className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-sm font-bold text-accent"
        >
          {rank}
        </span>
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
          <div className="h-full rounded-full bg-accent" style={{ width: `${matchPercent}%` }} />
        </div>
        <span className="tnum shrink-0 text-sm font-semibold text-accent">
          {formatPersianScore(matchPercent)} تطابق
        </span>
      </div>

      {explanation ? (
        <div className="flex flex-col gap-1 rounded-2xl border border-accent/25 bg-accent-soft p-3">
          <span className="text-xs font-semibold text-accent">چرا بهت میاد؟</span>
          <p className="text-sm leading-7 text-foreground/90">{explanation}</p>
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
          className="flex min-h-11 items-center justify-center rounded-2xl border border-border-soft px-5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent"
        >
          مشاهده عطر →
        </a>
      ) : null}
    </article>
  );
}
