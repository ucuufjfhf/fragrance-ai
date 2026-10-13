import { formatPersianPercent, toPersianDigits } from "@/lib/persian";
import { BrandMark } from "@/components/ui-icons";

interface ProgressBarProps {
  /** 1-based position of the current question. */
  current: number;
  total: number;
}

/**
 * The «سؤال ۳ از ۱۰» label plus a hairline progress track.
 *
 * The copy, the Persian digits and the accessible progressbar contract are the
 * quiz's own; only the chrome (thin track, terracotta gradient, muted label) is
 * restyled to match the homepage.
 */
export default function ProgressBar({ current, total }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted">
        <BrandMark className="h-4 w-4 text-accent" />
        <span aria-live="polite">
          سؤال {toPersianDigits(current)} از {toPersianDigits(total)}
        </span>
        <span className="tnum mr-auto text-xs tracking-wide">
          {formatPersianPercent(percent)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="پیشرفت آزمون"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-linear-to-l from-accent to-accent/70 transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
