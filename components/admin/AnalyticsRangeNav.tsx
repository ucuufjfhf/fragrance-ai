import Link from "next/link";

import type { AnalyticsRangePreset } from "@/lib/analytics/service";

/**
 * Date-range preset navigation for the analytics dashboard (§15).
 * Server-navigating links (no client JS) — the selected range is applied
 * server-side to every query. Default is ۷ روز اخیر.
 */

const PRESETS: Array<{ key: AnalyticsRangePreset; label: string }> = [
  { key: "today", label: "امروز" },
  { key: "7d", label: "۷ روز اخیر" },
  { key: "30d", label: "۳۰ روز اخیر" },
];

export default function AnalyticsRangeNav({
  storeId,
  current,
}: {
  storeId: string;
  current: AnalyticsRangePreset;
}) {
  return (
    <nav aria-label="بازه زمانی" className="flex flex-wrap gap-2">
      {PRESETS.map((preset) => (
        <Link
          key={preset.key}
          href={`/admin/analytics?store=${encodeURIComponent(storeId)}&range=${preset.key}`}
          aria-current={preset.key === current ? "true" : undefined}
          className={`rounded-full border px-4 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
            preset.key === current
              ? "border-accent bg-accent-soft font-medium text-accent"
              : "border-border-soft text-muted hover:border-accent/50 hover:text-accent"
          }`}
        >
          {preset.label}
        </Link>
      ))}
    </nav>
  );
}
