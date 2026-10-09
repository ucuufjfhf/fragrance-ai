import Link from "next/link";

import { ArrowLeftMark, StarMark } from "@/components/ui-icons";

/**
 * The night-sky frame around every page: a slim, dark band that carries the
 * wordmark and the two real destinations of the product (home + the quiz).
 *
 * No invented navigation: every link here points at a route that exists.
 */
export default function SiteHeader() {
  return (
    <header
      data-surface="dark"
      className="sticky top-0 z-50 border-b border-border-soft/70 bg-night/90 backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-full py-1 pe-2"
          aria-label="فیاج — صفحهٔ اصلی"
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-champagne/45 bg-champagne/5 transition-colors group-hover:border-champagne/80">
            <StarMark className="h-3.5 w-3.5 text-champagne" />
          </span>
          <span className="flex flex-col">
            <span dir="ltr" className="font-display text-base leading-6 text-ivory">
              FIAgÉ
            </span>
            <span className="hidden text-[0.66rem] leading-4 text-muted sm:block">
              عطر، برای کسی که هستی
            </span>
          </span>
        </Link>

        <nav aria-label="ناوبری اصلی" className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/"
            className="hidden rounded-full px-3 py-2 text-sm text-muted transition-colors hover:text-ivory sm:block"
          >
            خانه
          </Link>
          <Link
            href="/quiz"
            className="hidden rounded-full px-3 py-2 text-sm text-muted transition-colors hover:text-ivory sm:block"
          >
            آزمون سلیقه
          </Link>
          <Link
            href="/quiz"
            className="btn-primary flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium sm:px-5"
          >
            شروع آزمون
            <ArrowLeftMark className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
