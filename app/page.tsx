import Image from "next/image";
import Link from "next/link";

import FaqSection from "@/components/landing/FaqSection";
import SampleResultSection from "@/components/landing/SampleResultSection";
import MarkerWipe from "@/components/quiz/MarkerWipe";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";

/**
 * GET / — the public landing page.
 *
 * This is a brand page, not a project dashboard: a single editorial hero
 * (headline on the right, dark perfume visual on the left — asymmetric, RTL),
 * a short three-step explainer, a labelled sample-result preview, an honest
 * FAQ, and one confident trust line. Operational detail (phase roadmap,
 * status cards, admin routes) belongs to the repo, not to the shopper.
 */

const steps = [
  {
    n: "۱",
    title: "به ۱۰ سوال جواب بدید",
    detail: "سوال‌های کوتاه و ساده؛ فقط سلیقه‌تون رو بگید.",
  },
  {
    n: "۲",
    title: "پروفایل عطری‌تون ساخته میشه",
    detail: "از جواب‌هاتون یک پروفایل سلیقه با ۹ محور درست میشه.",
  },
  {
    n: "۳",
    title: "۳ عطر منتخب رو ببینید",
    detail:
      "بر اساس پنج محور رایحه‌ای پروفایل‌تون انتخاب می‌شن؛ با توضیح اینکه هر کدوم چرا به سلیقه‌تون می‌خوره.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        {/* Hero — asymmetric editorial split: copy on the right, moody visual on the left. */}
        <section className="relative">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 pb-14 pt-12 sm:px-8 lg:grid-cols-[1fr_0.92fr] lg:gap-16 lg:pb-24 lg:pt-20">
            <div className="flex flex-col items-start gap-6">
              {/* Two fixed lines: «کنید» can never be orphaned at the end of a
                  line, at any width. The text is unchanged, split at the
                  natural clause break — only «خودتون» now carries the site's
                  marker-wipe, the same shipped component (and the same static
                  finished highlight) the quiz intro already uses. */}
              <h1 className="font-heading text-4xl font-bold leading-[1.3] text-foreground sm:text-5xl lg:text-6xl">
                <span className="block">
                  عطر <MarkerWipe replayKey="home-hero">خودتون</MarkerWipe> رو
                </span>{" "}
                <span className="block">پیدا کنید</span>
              </h1>
              <p className="max-w-xl text-lg leading-loose text-muted">
                فقط ۱۰ سوال کوتاه؛ بعدش می‌فهمید کدوم رایحه واقعاً به سلیقه و شخصیتتون می‌خوره —
                نه بر اساس تبلیغ، بر اساس خودتون.
              </p>
              <Link
                href="/quiz"
                className="btn-primary flex min-h-14 items-center justify-center px-9 text-lg font-medium text-background"
              >
                شروع آزمون
              </Link>
              <p className="text-sm text-muted">حدود دو دقیقه وقت می‌گیره · بدون ثبت‌نام</p>
            </div>

            <div className="relative mx-auto w-full max-w-[270px] sm:max-w-[300px] lg:max-w-[330px]">
              {/* Two still light layers behind the glass — the gold-and-wine pair
                  from the quiz ambience, frozen into one glow. Both are pure
                  paint: no animation, no keyframes, no transition, and nothing
                  animated is imported from the quiz. Horizontally they stay
                  inside this column's box (inset-x-0 and percentage insets, no
                  negative offsets), so the bloom can never widen the page on a
                  phone. They come first in source order, so the bottle and its
                  ground shadow paint above them. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-[2%] h-[76%]"
                style={{
                  backgroundImage:
                    "radial-gradient(58% 46% at 50% 42%, color-mix(in srgb, var(--marker-gold) 34%, transparent) 0%, color-mix(in srgb, var(--marker-gold) 17%, transparent) 40%, transparent 70%)",
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute right-[4%] top-[26%] h-[44%] w-[62%]"
                style={{
                  backgroundImage:
                    "radial-gradient(closest-side, color-mix(in srgb, var(--wine) 13%, transparent) 0%, color-mix(in srgb, var(--wine) 7%, transparent) 46%, transparent 100%)",
                }}
              />
              <div className="relative aspect-[293/669] w-full">
                <Image
                  src="/hero/fiage-hero-bottle.webp"
                  alt="بطری عطر شیشه‌ای فیاژ با گرادیان کهربایی تا سرمه‌ای، درِ مشکی و نشان FIAGE روی شیشه"
                  fill
                  priority
                  sizes="(min-width: 1024px) 42vw, (min-width: 640px) 448px, 90vw"
                  className="object-contain"
                />
              </div>
              <div
                aria-hidden
                className="absolute inset-x-10 bottom-1 h-8 rounded-[100%] bg-black/25 blur-2xl"
              />
            </div>
          </div>
        </section>

        {/* How it works — three steps, numbers only. */}
        <section id="how" className="border-y border-border-soft bg-surface-2">
          <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
            <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
              سه قدم تا عطرتون
            </h2>
            <ol className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
              {steps.map((step) => (
                <li key={step.n} className="flex flex-col gap-3">
                  <span className="font-heading text-4xl font-semibold text-accent">
                    {step.n}
                  </span>
                  <span className="h-px w-10 bg-border-soft" />
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-loose text-muted">{step.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Sample result — one fixed archetype, always labelled an example. */}
        <SampleResultSection />

        {/* Honest FAQ — verifiable answers only, no stats, no testimonials. */}
        <FaqSection />

        {/* Trust line — said once, with confidence. */}
        <section className="mx-auto w-full max-w-3xl px-5 py-16 text-center sm:px-8 lg:py-24">
          <p className="font-heading text-xl font-semibold leading-loose text-foreground sm:text-2xl">
            بدون حدس و گمان؛ انتخاب بر اساس پروفایل دقیق شما
          </p>
          {/* The page used to end on the trust line with nowhere to go; the
              hero's primary action closes it. */}
          <Link
            href="/quiz"
            className="btn-primary mx-auto mt-8 flex w-fit min-h-14 items-center justify-center px-9 text-lg font-medium text-background"
          >
            شروع آزمون
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
