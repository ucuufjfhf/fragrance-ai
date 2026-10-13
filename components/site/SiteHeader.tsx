import Link from "next/link";

import { BrandMark } from "@/components/ui-icons";

/**
 * Minimal public top nav (homepage chrome).
 *
 * Deliberately tiny: a brand mark that links home, plus two quiet links and the
 * single primary action (the quiz). No admin routes, no phase/status badges —
 * this bar is branding, not a changelog.
 */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-soft/70 bg-background/85 backdrop-blur">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
        >
          <BrandMark className="h-6 w-6 text-accent" />
          <span className="font-heading text-lg font-semibold tracking-tight">Fragrance AI</span>
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <a
            href="#how"
            className="hidden text-muted transition-colors hover:text-foreground sm:inline"
          >
            چطور کار می‌کند
          </a>
          <Link
            href="/quiz"
            className="flex min-h-10 items-center rounded-full bg-accent px-5 font-medium text-background transition-colors hover:bg-accent/90"
          >
            شروع آزمون
          </Link>
        </div>
      </nav>
    </header>
  );
}
