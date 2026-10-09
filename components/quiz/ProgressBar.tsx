import { formatPersianPercent, toPersianDigits } from "@/lib/persian";
import { StarMark } from "@/components/ui-icons";

interface ProgressBarProps {
  /** 1-based position of the current question. */
  current: number;
  total: number;
}

/**
 * The quiz progress indicator, drawn as a small constellation: one point per
 * question, joined by a hairline, filling in champagne as the shopper advances.
 *
 * The semantic contract is unchanged (a labelled `progressbar` with the same
 * 0–100 value plus the «سؤال ۳ از ۱۰» live label), so screen readers and tests
 * still read exactly what they read before.
 */
export default function ProgressBar({ current, total }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 text-sm text-muted">
        <StarMark className="h-3.5 w-3.5 accent-ink" />
        <span aria-live="polite" className="tnum">
          سؤال {toPersianDigits(current)} از {toPersianDigits(total)}
        </span>
        <span className="h-px flex-1 bg-border-soft" aria-hidden="true" />
        <span className="tnum text-xs text-muted">{formatPersianPercent(percent)}</span>
      </div>

      <div
        role="progressbar"
        aria-label="پیشرفت آزمون"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="flex items-center gap-1.5"
      >
        {Array.from({ length: total }, (_, index) => {
          const position = index + 1;
          const done = position < current;
          const isCurrent = position === current;
          return (
            <span key={position} aria-hidden="true" className="flex flex-1 items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-500 ${
                  done
                    ? "bg-champagne"
                    : isCurrent
                      ? "bg-champagne/60 ring-2 ring-champagne/30"
                      : "bg-border-soft"
                }`}
              />
              {position < total ? (
                <span
                  className={`h-px flex-1 transition-colors duration-500 ${
                    position < current ? "bg-champagne/60" : "bg-border-soft"
                  }`}
                />
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
