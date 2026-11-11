import { BrandMark } from "@/components/ui-icons";

/**
 * The widget's boot state (batch 45).
 *
 * The widget iframe used to show a neutral «در حال بارگذاری…» notice while the
 * store config resolved — the one genuinely dead stretch in the product, and a
 * merchant's first impression of their own embed. This is WidgetApp's INITIAL
 * view, not something added after a delay: it paints on the first render and is
 * replaced in the same commit that resolves the config onto the quiz intro.
 *
 * There is deliberately no minimum display time. A fast config resolves and the
 * boot simply goes away — a brief flash is honest, while holding the boot on
 * screen would be a fake loader.
 *
 * FIAGE-branded on purpose: the store's identity does not exist yet (the config
 * is exactly what is in flight), so the boot cannot show the merchant's logo or
 * accent. Once the config lands, every later phase uses the store's branding.
 *
 * Motion is loading-scoped and small-area, and lives in `app/globals.css`
 * (`.widget-boot*`): the mark breathes, a gold line sweeps, the skeleton bars
 * pulse, all with transform/opacity only. Under `prefers-reduced-motion` every
 * one of them is off and this markup renders static.
 */
export default function WidgetBoot() {
  return (
    <section
      aria-busy="true"
      className="widget-boot relative flex flex-col items-center gap-3 overflow-hidden rounded-[1.5rem] border border-border-soft bg-surface px-6 py-10 text-center"
    >
      <span className="flex items-baseline gap-2">
        <BrandMark className="h-4 w-4 self-center text-accent" />
        <span className="font-editorial text-sm font-semibold tracking-[0.35em] text-foreground">
          FIAGE
        </span>
      </span>
      <span className="font-editorial text-[0.6rem] tracking-[0.3em] text-muted">
        FIND YOUR SCENT
      </span>

      {/* The breathing gold star — the sample's one point of life. */}
      <span
        aria-hidden="true"
        className="widget-boot-star mt-3 text-lg leading-none"
        style={{ color: "var(--marker-gold)" }}
      >
        ✦
      </span>

      {/* A cream track with a gold sweep crossing it. */}
      <span
        aria-hidden="true"
        className="relative mt-1 block h-px w-36 overflow-hidden rounded-full bg-border-soft"
      >
        <span
          className="widget-boot-shimmer absolute inset-y-0 left-0 w-1/3 rounded-full"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent, var(--marker-gold), transparent)",
          }}
        />
      </span>

      <p role="status" className="mt-2 text-sm leading-7 text-muted">
        در حال آماده‌سازی آزمون…
      </p>

      {/* Three quiet skeleton bars — static geometry, opacity-only pulse. */}
      <span aria-hidden="true" className="mt-1 flex w-full max-w-56 flex-col gap-2">
        <span className="widget-boot-bar h-2 w-full rounded-full bg-surface-2" />
        <span className="widget-boot-bar h-2 w-4/5 rounded-full bg-surface-2" />
        <span className="widget-boot-bar h-2 w-3/5 rounded-full bg-surface-2" />
      </span>
    </section>
  );
}
