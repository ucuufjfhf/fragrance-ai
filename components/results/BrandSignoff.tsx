/**
 * The /result sign-off — the page's closing signature.
 *
 * The results page used to end on an action (share / retake). It now ends like a
 * letter: the FIAGE mark, the wordmark, the FIND YOUR SCENT line, and one
 * Persian sentence above them. Presentational only — no data, no archetype.
 *
 * It closes BOTH /result modes (the demo result and merchant inventory): the
 * results page is a FIAGE page either way. The widget's result screen lives
 * inside a merchant site and deliberately does not mount this.
 */

/**
 * The owner-picked closing line — byte-exact, including the «؛» and the stop.
 * Never reword, re-punctuate or re-space this: it is approved copy.
 */
export const BRAND_SIGNOFF_LINE = "این فقط یه عطر نیست؛ امضای شماست.";

/**
 * Quiet entrance: `.quiz-rise` is the page's existing one-shot fade, and its
 * reduced-motion rule already turns it off — so this section is simply present
 * for shoppers who ask for less motion. Nothing here loops.
 */
export default function BrandSignoff() {
  return (
    <section className="brand-signoff quiz-rise flex flex-col items-center gap-2.5 pt-10 text-center">
      {/* Bundled public/ asset, not merchant data: a plain <img> keeps the exact
          file and its 1:1 ratio. Decorative — the wordmark below carries the
          name. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/fiage-mark.png"
        alt=""
        width={560}
        height={560}
        className="h-[72px] w-[72px] object-contain"
      />
      <span className="font-serif text-lg tracking-[0.3em] text-foreground">
        FIAGE
      </span>
      <span
        dir="ltr"
        className="text-[0.65rem] font-medium tracking-[0.28em] text-muted"
      >
        FIND YOUR SCENT
      </span>
      <span aria-hidden="true" className="mt-1 h-px w-10 bg-border-soft" />
      <p className="mt-1 max-w-md text-sm leading-8 text-foreground/80">
        {BRAND_SIGNOFF_LINE}
      </p>
    </section>
  );
}
