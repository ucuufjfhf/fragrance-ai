import type { Metadata } from "next";
import Link from "next/link";

import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";

/**
 * GET /about — who FIAGE is, in the brand's own voice.
 *
 * The story below is the owner-approved brand rewrite (2026-11-14) — his exact
 * copy, kept byte-for-byte: not reworded, not «polished». The colloquial words
 * and the em dash are deliberate. No invented details are added: no surname,
 * no dates, no stats, no testimonials.
 */

export const metadata: Metadata = {
  title: "درباره‌ی فیاژ | FIAGE",
  description:
    "هر کسی یه امضای بویایی داره. فیاژ با ۱۰ سوال کوتاه نقشهٔ سلیقهٔ شما رو می‌سازه و سه عطر منتخب رو با دلیل نشون می‌ده.",
};

const whatItDoes = [
  {
    n: "۱",
    title: "۱۰ سوال کوتاه",
    detail: "دربارهٔ سبک و حس‌وحال شما؛ چند دقیقه بیشتر طول نمی‌کشه.",
  },
  {
    n: "۲",
    title: "نقشهٔ سلیقه‌تون ساخته می‌شه",
    detail: "از جواب‌هاتون یه پروفایل بویایی روی ۹ محور درست می‌شه.",
  },
  {
    n: "۳",
    title: "سه عطر، با دلیل",
    detail:
      "سه‌تایی که روی پنج محور رایحه‌ای به نقشهٔ شما می‌خورن، با توضیح اینکه چرا.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-3xl px-5 pb-6 pt-12 sm:px-8 lg:pt-20">
          {/* text-muted (not accent): the site accent is 4.32:1 at this
              size — the muted token clears AA. */}
          <p className="text-sm font-medium text-muted">درباره‌ی فیاژ</p>
          <h1 className="mt-2 font-heading text-4xl font-bold leading-[1.3] text-foreground sm:text-5xl">
            هر کسی یه امضای بویایی داره
          </h1>
        </section>

        {/* The brand story — the owner-approved rewrite (2026-11-14). */}
        <section
          aria-labelledby="founder-story"
          className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8"
        >
          <h2
            id="founder-story"
            className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
          >
            چرا فیاژ؟
          </h2>
          <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-6 sm:p-8">
            <p className="leading-loose text-foreground/90">
              عطر خریدن معمولاً شانسیه: صدها شیشه، توضیح‌هایی که همه‌شون شبیه همن،
              و قیمتی که اشتباه رو گرون می‌کنه.
            </p>
            <p className="leading-loose text-foreground/90">
              فیاژ برای همین ساخته شد. سلیقهٔ هر کسی یه شکل بویایی داره و عطر
              درست همونیه که به اون شکل می‌خوره — نه گرون‌ترین، نه معروف‌ترین. ما
              اول شما رو می‌شناسیم، بعد سه عطر نشون می‌دیم که واقعاً مال شماست، با
              دلیل.
            </p>
            <p className="text-sm leading-loose text-muted">
              بدون ثبت‌نام و بدون هزینه.
            </p>
          </div>
        </section>

        {/* What FIAGE does — the same three steps as the landing. */}
        <section
          aria-labelledby="what-it-does"
          className="border-y border-border-soft bg-surface-2"
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
            <h2
              id="what-it-does"
              className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
            >
              فیاژ چطور کار می‌کنه؟
            </h2>
            <ol className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
              {whatItDoes.map((step) => (
                <li key={step.n} className="flex flex-col gap-3">
                  <span className="font-heading text-4xl font-semibold text-accent">
                    {step.n}
                  </span>
                  <span className="h-px w-10 bg-border-soft" />
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-loose text-muted">
                    {step.detail}
                  </p>
                </li>
              ))}
            </ol>
            <Link
              href="/quiz"
              className="btn-primary mt-10 flex min-h-14 items-center justify-center px-9 text-lg font-medium text-background sm:w-fit"
            >
              شروع آزمون
            </Link>
          </div>
        </section>

        {/* Contact — a direct email link. */}
        <section
          aria-labelledby="contact"
          className="mx-auto w-full max-w-3xl px-5 py-14 text-center sm:px-8 lg:py-20"
        >
          <h2
            id="contact"
            className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
          >
            تماس با ما
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-loose text-muted">
            سوال یا پیشنهادی دارید؟ مستقیم ایمیل بزنید — در اسرع وقت پاسخ می‌دیم.
          </p>
          <a
            href="mailto:majid@fiage.ir"
            className="btn-tertiary btn-tertiary-forward mx-auto mt-8 text-lg font-medium"
          >
            ایمیل بزنید
          </a>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
