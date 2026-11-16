"use client";

import { useEffect } from "react";

import { WarningMark } from "@/components/ui-icons";

/**
 * Widget-scoped error boundary — chromeless by design.
 *
 * `/widget` is the document a merchant embeds in an iframe, and its contract is
 * the opposite of the public site's: inside the frame it renders zero site
 * chrome (`WidgetChromeHeader`/`WidgetChromeFooter` render nothing when
 * `isEmbeddedWidget` is true) and nothing fixed or animated. Without this file
 * a render throw fell to `app/error.tsx`, which imports `SiteHeader`,
 * `SiteFooter` and navigation links — the whole public site inside a merchant's
 * page.
 *
 * So this boundary renders one compact card: the bundled mark, a warning glyph,
 * fixed Persian copy and a retry button. No header, no footer, no links at all —
 * a link inside the frame would navigate the iframe, not the merchant's page, so
 * retry is the only action that makes sense.
 *
 * Per the bundled Next 16 `error.js` guide: error boundaries must be Client
 * Components, the nearest `error.js` wins, and it does not wrap the layout above
 * it. Logging stays digest-only and the thrown value is never rendered.
 */
export default function WidgetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("widget failed:", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background p-4 sm:p-6">
      <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-border-soft bg-surface p-6 text-center sm:p-8">
        {/* Bundled public/ asset, not merchant data: a plain <img> keeps the
            exact file, with no loader in between. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/fiage-mark.png"
          alt="FIAGE"
          width={560}
          height={560}
          className="h-10 w-10 shrink-0 object-contain"
        />

        <WarningMark className="mx-auto h-8 w-8 text-accent" />

        <h1 className="font-heading text-lg font-semibold text-foreground">
          مشکلی پیش اومد
        </h1>

        <p className="text-sm leading-8 text-muted">
          در بارگذاری ویجت خطایی رخ داد. می‌تونید دوباره تلاش کنید.
        </p>

        <button
          type="button"
          onClick={reset}
          className="btn-primary flex min-h-12 items-center justify-center px-6 font-medium text-background"
        >
          تلاش دوباره
        </button>
      </section>
    </main>
  );
}
