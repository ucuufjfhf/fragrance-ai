import type { Metadata } from "next";
import Link from "next/link";

import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";

/**
 * GET /about — who FIAGE is, in the founder's own voice.
 *
 * The story below is majid's text with light polish only (spacing, flow) —
 * his words and colloquial warmth are kept as given. No biographical details
 * are added: no surname, no dates, no stats, no testimonials.
 */

export const metadata: Metadata = {
  title: "درباره‌ی فیاژ | FIAGE",
  description:
    "فیاژ دستیار شخصی رایگان عطر شماست؛ با ۱۰ سوال، پروفایل عطری‌تون ساخته میشه و ۳ عطر منتخب با دلیل می‌بینید.",
};

const whatItDoes = [
  {
    n: "۱",
    title: "به ۱۰ سوال جواب بدید",
    detail: "کوتاه و ساده؛ فقط سلیقه‌تون رو بگید.",
  },
  {
    n: "۲",
    title: "پروفایل ۹محوره‌تون ساخته میشه",
    detail: "از جواب‌هاتون یک پروفایل رایحه درست میشه.",
  },
  {
    n: "۳",
    title: "۳ عطر منتخب رو با دلیل ببینید",
    detail: "با توضیح اینکه هر کدوم چرا با پروفایل شما جوره.",
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
            دستیار شخصی رایگان عطر شما
          </h1>
        </section>

        {/* The founder's story — his voice, lightly polished. */}
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
              فیاژ دستیار شخصی رایگان عطر شماست. بعد از دو سال استفاده از
              عطرهای مختلف تصمیم گرفتم یه دستیاری بسازم که با توجه به شرایط
              اخیر بتونه به همه کمک کنه تا بدون هزینه‌ی اضافی، عطری که نشانه‌ی
              خودشونه رو انتخاب کنن.
            </p>
            <p className="text-sm leading-loose text-muted">
              بدون ثبت‌نام، بدون هزینه — فقط با جواب دادن به چند سوال کوتاه.
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
              className="mt-10 flex min-h-14 items-center justify-center rounded-2xl border border-border-soft px-9 text-lg font-medium text-foreground transition-colors hover:border-accent/50 sm:w-fit"
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
            سوال، پیشنهاد یا حرفی درباره عطرها دارید؟ خوشحال میشم بشنوم — مستقیم
            ایمیل بزنید.
          </p>
          <a
            href="mailto:majidemoon0@gmail.com"
            className="mx-auto mt-8 flex min-h-14 w-full items-center justify-center rounded-2xl border border-border-soft px-9 text-lg font-medium text-foreground transition-colors hover:border-accent/50 sm:w-fit"
          >
            ایمیل بزنید
          </a>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
