import Link from "next/link";

/**
 * Minimal public top nav (homepage chrome).
 *
 * Deliberately tiny: the brand (the FIAGE mark plus the wordmark as real type),
 * two quiet links and the single primary action (the quiz). No admin routes, no
 * phase/status badges — this bar is branding, not a changelog.
 *
 * The brand is the delivered artwork, not a redrawn glyph: `brand/fiage-mark.png`
 * is the 560×560 monogram master, and «FIAGE» next to it is live text so the
 * wordmark stays selectable, searchable and resolution-independent. Both sit in
 * a flex row, so in this RTL document the mark lands at the inline-start (right)
 * with the wordmark beside it.
 *
 * The mark's artwork is drawn on its own paper (#fbf7ef), which is within 3/255
 * of `--background` (#faf7f2) — so the bar needs no plate behind it: the image
 * blends into the header instead of showing a tile. `width`/`height` are set to
 * the file's real 560×560, so the box is reserved and the bar cannot shift.
 */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-soft/70 bg-background/85 backdrop-blur">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-foreground transition-opacity hover:opacity-80"
        >
          {/* Bundled public/ asset, not merchant data: a plain <img> keeps the
              exact file and its ratio, with no loader in between. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/fiage-mark.png"
            alt="FIAGE"
            width={560}
            height={560}
            className="h-9 w-9 shrink-0 object-contain"
          />
          {/* Letterspaced serif, echoing the lockup's wordmark. The negative
              inline-end margin cancels the tracking the last letter adds, so the
              type ends flush instead of leaving a phantom gap. */}
          <span className="me-[-0.3em] font-serif text-base tracking-[0.3em]">FIAGE</span>
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <a
            href="#how"
            className="hidden text-muted transition-colors hover:text-foreground sm:inline"
          >
            چطور کار می‌کند
          </a>
          {/* btn-primary owns the AA fill, the flat hover and the 3px corner;
              size and placement stay the header CTA's own. */}
          <Link
            href="/quiz"
            className="btn-primary flex min-h-10 items-center px-5 font-medium text-background"
          >
            شروع آزمون
          </Link>
        </div>
      </nav>
    </header>
  );
}
