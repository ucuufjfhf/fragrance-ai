import type { CSSProperties, ReactNode } from "react";

import { normalizeAccentColor } from "@/lib/store/branding";

/**
 * The widget's own shell — the ONLY element that may carry a merchant accent.
 *
 * A store's `accentColor` is applied here as the `--accent` custom property, so
 * every accent-derived colour inside the widget (`text-accent`, `bg-accent`,
 * `border-accent/30`, `color-mix(... var(--accent) ...)`) follows the merchant's
 * brand automatically. Nothing outside this subtree is touched: the main site
 * keeps its own token from `app/globals.css`, and the widget page's static warm
 * wash is deliberately colour-neutral, so the frame never shifts.
 *
 * Null (or a value that no longer matches `#rrggbb`) renders NO override at all
 * rather than a broken colour — that is exactly the widget shipped before this
 * field existed.
 */
export default function WidgetShell({
  accentColor,
  children,
}: {
  accentColor?: string | null;
  children: ReactNode;
}) {
  const accent = normalizeAccentColor(accentColor);

  return (
    <div
      data-widget-shell=""
      className="flex flex-col gap-5"
      style={accent ? ({ "--accent": accent } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
