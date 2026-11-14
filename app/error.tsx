"use client";

import Link from "next/link";
import { useEffect } from "react";

import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import { WarningMark } from "@/components/ui-icons";

/**
 * Root error boundary — the branded fallback for an uncaught render error
 * outside a segment that ships its own boundary (`/result`, `/admin/perfumes`).
 *
 * Next requires error boundaries to be Client Components, and per the bundled
 * Next 16 `error.js` guide this file wraps `page`/`loading`/`not-found` and
 * nested layouts, but NOT the root layout above it — a throw there still lands
 * on Next's own default page (a `global-error.tsx` would be the heavier,
 * separate fix).
 *
 * Chrome comes from the same primitives as `app/not-found.tsx` — `SiteHeader`,
 * `SiteFooter`, the bundled FIAGE mark (a plain <img>, exactly as the header
 * uses it) and the `.btn-primary` tier — so a crash still reads as FIAGE.
 *
 * Logging is digest-only and the thrown value is never rendered: `error.digest`
 * is the support handle that matches server logs, and `error.message` is the
 * client-side fallback when no digest exists. Neither reaches the user.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Same discipline as the segment boundaries: digest-only, no server detail.
    console.error("root error boundary:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8">
        <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
          {/* Bundled public/ asset, not merchant data: a plain <img> keeps the
              exact file, with no loader in between. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/fiage-mark.png"
            alt="FIAGE"
            width={560}
            height={560}
            className="h-16 w-16 shrink-0 object-contain"
          />

          <WarningMark className="mx-auto h-8 w-8 text-accent" />

          <h1 className="font-heading text-3xl font-bold leading-[1.3] text-foreground sm:text-4xl">
            مشکلی پیش اومد
          </h1>

          <p className="text-base leading-loose text-muted">
            در بارگذاری این صفحه خطایی رخ داد. می‌تونید دوباره تلاش کنید یا به صفحهٔ اول
            برگردید.
          </p>

          <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="btn-primary flex min-h-14 items-center justify-center px-9 text-lg font-medium text-background"
            >
              تلاش دوباره
            </button>
            <Link
              href="/"
              className="flex min-h-11 items-center justify-center px-5 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              بازگشت به خانه
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
