"use client";

import { ArrowLeftMark, BottleMark, StarMark } from "@/components/ui-icons";
import { trackEvent } from "@/lib/analytics/client";
import { formatPersianScore, toPersianDigits } from "@/lib/persian";
import type { WidgetRecommendation } from "@/lib/widget/contract";

/**
 * One recommendation inside the widget (Phase 8).
 *
 * The compact sibling of the public recommendation card: same visual language
 * (hairline borders, one champagne accent, one match meter) at merchant-widget
 * scale. Renders only customer-safe fields from the widget API (§12). A missing
 * productUrl renders no CTA at all — a fake URL is never invented (§17).
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
    <article className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-4">
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
              className="h-14 w-14 shrink-0 rounded-[var(--radius-md)] border border-border-soft object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-soft bg-accent-soft"
            >
              <BottleMark className="h-6 w-6 text-champagne-deep/70" />
            </span>
          )}

          <div className="flex flex-col gap-0.5">
            <h3 className="font-heading text-base leading-7 text-ink">{name}</h3>
            <span className="text-xs text-muted">{brand}</span>
          </div>
        </div>

        <span
          aria-label={`رتبه ${rank}`}
          className="tnum shrink-0 text-xs text-muted"
        >
          {toPersianDigits(rank)}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.7rem] text-muted">میزان تطابق</span>
          <span className="tnum accent-ink font-heading text-sm font-semibold">
            {formatPersianScore(matchPercent)}
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border-soft/70"
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
                "linear-gradient(to left, var(--accent), color-mix(in srgb, var(--accent) 58%, var(--foreground)))",
            }}
          />
        </div>
      </div>

      {explanation ? (
        <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-accent-soft p-3">
          <span className="eyebrow flex items-center gap-1.5 text-champagne-deep">
            <StarMark className="h-3 w-3" />
            چرا بهت میاد؟
          </span>
          <p className="text-xs leading-7 text-foreground/90">{explanation}</p>
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
          className="btn-ghost flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium"
        >
          مشاهده عطر
          <ArrowLeftMark className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </article>
  );
}
