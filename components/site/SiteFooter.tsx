import Link from "next/link";

/**
 * Quiet public footer (homepage chrome).
 *
 * One brand plate, a couple of tiny links, and the copyright. Nothing
 * operational leaks here — no admin routes, no build/phase metadata.
 *
 * The brand is the delivered lockup (`brand/fiage-logo.png`, the 1254×1254
 * master: monogram + FIAGE + the FIND YOUR SCENT rule), shown whole. That
 * artwork is drawn on its own paper (#faf7ef), while this footer sits on
 * `--surface-2` (#f5f0e8) — a visible step if the image were dropped straight
 * onto it — so the lockup sits on a plate tinted `--background` (#faf7f2), which
 * is within 3/255 of the artwork's paper: the plate gives the lockup an
 * intentional edge and the paper blends into it. `width`/`height` carry the
 * file's real 1254×1254, so the footer reserves the space and does not shift.
 */
export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border-soft bg-surface-2">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row-reverse sm:items-center sm:justify-between sm:px-8">
        <div className="w-fit rounded-2xl border border-border-soft bg-background p-2">
          {/* Bundled public/ asset, not merchant data: a plain <img> keeps the
              exact file and its 1:1 ratio, with no loader in between. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/fiage-logo.png"
            alt="FIAGE"
            width={1254}
            height={1254}
            className="h-auto w-[150px]"
          />
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          {/* Root-absolute so the anchor also works from /about and /result. */}
          <Link href="/#how" className="transition-colors hover:text-foreground">
            چطور کار می‌کند
          </Link>
          <Link href="/quiz" className="transition-colors hover:text-foreground">
            آزمون سلیقه
          </Link>
          <Link href="/about" className="transition-colors hover:text-foreground">
            درباره‌ی فیاژ
          </Link>
          <a
            href="mailto:majidemoon0@gmail.com"
            className="transition-colors hover:text-foreground"
          >
            تماس
          </a>
        </nav>

        <p className="text-xs leading-relaxed text-muted">
          © ۱۴۰۵ FIAGE — انتخاب عطر بر اساس پروفایل تو.
        </p>
      </div>
    </footer>
  );
}
