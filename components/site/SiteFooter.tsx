import Link from "next/link";

import { BrandMark } from "@/components/ui-icons";

/**
 * Quiet public footer (homepage chrome).
 *
 * One brand line, a couple of tiny links, and the copyright. Nothing
 * operational leaks here — no admin routes, no build/phase metadata.
 */
export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border-soft bg-surface-2">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row-reverse sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2 text-foreground">
          <BrandMark className="h-5 w-5 text-accent" />
          <span className="font-heading text-base font-semibold">Fragrance AI</span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          <a href="#how" className="transition-colors hover:text-foreground">
            چطور کار می‌کند
          </a>
          <Link href="/quiz" className="transition-colors hover:text-foreground">
            آزمون سلیقه
          </Link>
        </nav>

        <p className="text-xs leading-relaxed text-muted">
          © ۱۴۰۵ Fragrance AI — انتخاب عطر بر اساس پروفایل تو.
        </p>
      </div>
    </footer>
  );
}
