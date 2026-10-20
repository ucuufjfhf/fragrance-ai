import Image from "next/image";
import Link from "next/link";

import FaqSection from "@/components/landing/FaqSection";
import SampleResultSection from "@/components/landing/SampleResultSection";
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
    detail: "از جواب‌هاتون یک پروفایل رایحه با ۹ محور درست میشه.",
  },
  {
    n: "۳",
    title: "۳ عطر منتخب رو ببین",
    detail: "با توضیح اینکه هر کدوم چرا با پروفایل شما جور است.",
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
              <h1 className="font-heading text-4xl font-bold leading-[1.3] text-foreground sm:text-5xl lg:text-6xl">
                عطر خودتون رو پیدا کنید
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

            <div className="relative">
              <div className="relative aspect-4/5 w-full overflow-hidden rounded-[2rem] border border-border-soft shadow-[var(--shadow-soft)] sm:aspect-3/4 lg:aspect-4/5">
                <Image
                  src="/hero/perfume-hero.jpg"
                  alt="شیشه عطر کهربایی در نور کم، با دود و بافت زغالی"
                  fill
                  priority
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/55 via-black/10 to-transparent" />
              </div>
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
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
