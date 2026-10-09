"use client";

import { WarningMark } from "@/components/ui-icons";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary for /result.
 *
 * Reached when the server render itself throws (for example an invalid
 * personality vector rejected loudly by the engine, or a database outage) —
 * the deterministic promise is that this must never silently fabricate a
 * result, so the user gets a friendly Persian message and a restart action.
 */
export default function ResultError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Next.js requires client components for error boundaries; the digest is
    // the only safe thing to log — never server-side details or secrets.
    console.error("results page failed:", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col bg-background">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-5 py-16 sm:px-8">
        <section className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-surface px-6 py-12 text-center">
          <WarningMark className="h-8 w-8 text-champagne-deep" />
          <h1 className="display-md text-ink">مشکلی پیش اومد</h1>
          <p className="max-w-sm text-sm leading-8 text-muted">
            در آماده‌سازی نتیجه خطایی رخ داد. می‌تونی دوباره تلاش کنی یا آزمون رو از
            اول شروع کنی.
          </p>
          <div className="mt-1 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="btn-primary flex min-h-12 w-full items-center justify-center rounded-full px-7 text-sm font-medium sm:w-fit"
            >
              تلاش دوباره
            </button>
            <Link
              href="/quiz"
              className="flex min-h-11 items-center justify-center px-4 text-sm text-muted underline underline-offset-4 transition-colors hover:text-foreground"
            >
              شروع دوباره آزمون
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
