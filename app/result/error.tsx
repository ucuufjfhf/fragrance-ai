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
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <section className="flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-6 text-center sm:p-8">
        <WarningMark className="mx-auto h-8 w-8 text-accent" />
        <h1 className="text-xl font-bold sm:text-2xl">
          مشکلی پیش اومد
        </h1>
        <p className="text-sm leading-8 text-muted">
          در آماده‌سازی نتیجه خطایی رخ داد. می‌تونی دوباره تلاش کنی یا آزمون رو از
          اول شروع کنی.
        </p>
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-5 font-medium text-background transition-colors hover:bg-accent/90 sm:w-fit sm:px-8"
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
    </main>
  );
}
