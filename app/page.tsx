import Link from "next/link";

import { CosmicBackdrop, OrbitalDecoration } from "@/components/cosmic/cosmic-visuals";
import SectionHeading from "@/components/cosmic/SectionHeading";
import { ArrowLeftMark, BottleMark, MoonMark, StarMark } from "@/components/ui-icons";
import { ARCHETYPES } from "@/lib/personality/archetypes";
import { PERSONALITY_LABELS } from "@/lib/personality/labels";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";

/**
 * The Fiage homepage — "Cosmic Atelier".
 *
 * Composition (dark → light → dark → light → dark panel):
 *   1. night-sky hero with the single primary action
 *   2. the discovery process, as an editorial numbered column on ivory
 *   3. the eight real fragrance archetypes, on a night field
 *   4. how recommendations are actually produced (honest architecture note)
 *   5. a closing night panel holding the call to action
 *
 * Every claim on this page is derived from the application itself (10 questions,
 * 9 dimensions, 8 archetypes, deterministic matching, optional AI copy). There
 * are no invented testimonials, metrics, awards or merchant logos.
 */

/** Facts the product genuinely implements — used in the hero's quiet strip. */
const FACTS = [
  { value: "۱۰", label: "سؤال کوتاه" },
  { value: "۹", label: "بُعد سلیقه" },
  { value: "۸", label: "کهن‌الگو" },
  { value: "۰–۱۰۰", label: "نمرهٔ هر بُعد" },
] as const;

const STEPS = [
  {
    n: "۰۱",
    title: "به ۱۰ سؤال جواب می‌دهی",
    body:
      "هر سؤال یک انتخاب ساده است؛ جواب درست و غلطی وجود ندارد. فقط گزینه‌ای را انتخاب کن که به تو نزدیک‌تر است.",
  },
  {
    n: "۰۲",
    title: "پروفایل عطری‌ات ساخته می‌شود",
    body:
      "پاسخ‌ها به ۹ بُعد سلیقه تبدیل می‌شوند — تازگی، گرمی، مرموزی، جسارت و شش بُعد دیگر — هر کدام با نمره‌ای از ۰ تا ۱۰۰، به‌همراه یک کهن‌الگوی عطری.",
  },
  {
    n: "۰۳",
    title: "از موجودی واقعی فروشگاه پیشنهاد می‌گیری",
    body:
      "موتور تطبیق، عطرهای موجود فروشگاه را با پروفایل تو مقایسه و رتبه‌بندی می‌کند. عطرهای ناموجود از پیشنهادها کنار گذاشته می‌شوند.",
  },
] as const;

export default function Home() {
  const dimensions = PERSONALITY_DIMENSIONS.slice(0, 5);

  return (
    <main className="flex flex-1 flex-col">
      {/* ================= 1 · hero: the night sky ================= */}
      <section
        data-surface="dark"
        className="relative isolate overflow-hidden horizon grain"
        aria-labelledby="hero-title"
      >
        <CosmicBackdrop stars={64} seed={11} grain={false} />
        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-12 px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-6">
            <div className="flex max-w-xl flex-col gap-6">
              <span className="reveal eyebrow flex w-fit items-center gap-2 rounded-full border border-champagne/35 bg-champagne/5 px-4 py-1.5 text-champagne">
                <MoonMark className="h-3.5 w-3.5" />
                آتلیهٔ عطر فیاج
              </span>

              <h1 id="hero-title" className="reveal reveal-delay-1 display-xl text-ivory">
                رایحه‌ای که
                <span className="relative mx-2 inline-block text-champagne">
                  شبیه خودت
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-1 h-px bg-gradient-to-l from-transparent via-champagne/70 to-transparent"
                  />
                </span>
                است
              </h1>

              <p className="reveal reveal-delay-2 max-w-lg text-base leading-9 text-muted sm:text-lg">
                انتخاب عطر، یک کشف شخصی است، نه یک آزمون شخصیت. فیاج با ۱۰ سؤال کوتاه
                سلیقهٔ تو را می‌خواند، پروفایل عطری‌ات را می‌سازد و از میان موجودی
                واقعی فروشگاه، نزدیک‌ترین رایحه‌ها را پیشنهاد می‌دهد.
              </p>

              <div className="reveal reveal-delay-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/quiz"
                  className="btn-primary flex min-h-12 items-center justify-center gap-2 rounded-full px-7 text-base font-medium"
                >
                  شروع آزمون سلیقه
                  <ArrowLeftMark className="h-4 w-4" />
                </Link>
                <a
                  href="#how-it-works"
                  className="flex min-h-12 items-center justify-center rounded-full border border-border-soft px-6 text-sm text-muted transition-colors hover:border-champagne/50 hover:text-ivory"
                >
                  آزمون چطور کار می‌کند؟
                </a>
              </div>
            </div>

            {/* Atelier composition: orbital mark + the profile note. */}
            <div className="relative flex flex-1 items-center justify-center">
              <OrbitalDecoration size={380} className="relative mx-auto opacity-90" />
              <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xs rounded-[var(--radius-lg)] border border-border-soft bg-surface/80 p-4 backdrop-blur-sm sm:inset-auto sm:bottom-2 sm:w-64">
                <span className="eyebrow flex items-center gap-2 text-champagne">
                  <StarMark className="h-3 w-3" />
                  پروفایل تو
                </span>
                <ul className="mt-2 flex flex-col gap-1 text-xs leading-6 text-muted">
                  {dimensions.map((dimension) => (
                    <li key={dimension} className="flex items-center justify-between gap-2">
                      <span>{PERSONALITY_LABELS[dimension]}</span>
                      <span aria-hidden="true" className="h-px flex-1 bg-border-soft" />
                    </li>
                  ))}
                  <li className="text-[0.72rem] text-ivory/70">و ۴ بُعد دیگر…</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Product facts, not marketing metrics. */}
          <dl className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-border-soft pt-6">
            {FACTS.map((fact) => (
              <div key={fact.label} className="flex items-baseline gap-2">
                <dt className="tnum display-md text-champagne">{fact.value}</dt>
                <dd className="text-xs text-muted">{fact.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ================= 2 · the process (ivory editorial) ================= */}
      <section id="how-it-works" className="relative isolate scroll-mt-24 bg-background">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-16 sm:px-8 sm:py-24">
          <SectionHeading
            eyebrow="مسیر کشف"
            title="سه قدم تا عطری که به تو می‌آید"
            description="این مسیر در چند دقیقه تمام می‌شود و نتیجه‌اش قابل تکرار است: با همان پاسخ‌ها، همان پیشنهادها ساخته می‌شوند."
          />

          <ol className="flex flex-col">
            {STEPS.map((step, index) => (
              <li
                key={step.n}
                className={`grid grid-cols-1 gap-4 py-8 sm:grid-cols-[7rem_1fr] sm:gap-8 ${
                  index > 0 ? "border-t border-border-soft" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className="tnum display-md text-champagne-deep/70 sm:text-end"
                >
                  {step.n}
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="display-md text-ink">{step.title}</h3>
                  <p className="max-w-2xl text-sm leading-8 text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ================= 3 · the eight archetypes (night) ================= */}
      <section data-surface="dark" className="relative isolate overflow-hidden">
        <CosmicBackdrop stars={40} seed={29} atmosphere={false} constellation={false} intensity={0.7} />
        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-16 sm:px-8 sm:py-24">
          <SectionHeading
            eyebrow="کهن‌الگوها"
            tone="dark"
            title="هشت کهن‌الگوی عطری"
            description="پروفایل تو به نزدیک‌ترین کهن‌الگو نسبت داده می‌شود تا پیشنهادها یک زبان مشترک پیدا کنند. نمرهٔ ۹ بُعد سلیقه، مبنای اصلی تطبیق باقی می‌ماند."
          />

          <ul className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
            {ARCHETYPES.map((archetype, index) => (
              <li
                key={archetype.id}
                className={`flex items-start gap-4 py-5 ${
                  index >= 2 ? "border-t border-border-soft" : ""
                } sm:[&:nth-child(2)]:border-t-0`}
              >
                <span
                  aria-hidden="true"
                  className="mt-3 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: archetype.accentColor,
                    boxShadow: `0 0 0 5px color-mix(in srgb, ${archetype.accentColor} 22%, transparent)`,
                  }}
                />
                <div className="flex flex-col gap-1">
                  <h3 className="font-heading text-lg text-ivory">{archetype.label}</h3>
                  <p className="text-xs leading-7 text-muted">{archetype.description}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="flex items-center gap-2 text-xs leading-7 text-muted">
            <BottleMark className="h-4 w-4 shrink-0 text-celestial" />
            کهن‌الگو فقط یک نام برای پروفایل توست؛ پیشنهادها بر پایهٔ نمرهٔ واقعی همان ۹ بُعد
            انتخاب می‌شوند.
          </p>
        </div>
      </section>

      {/* ================= 4 · how matching works (ivory, honest) ================= */}
      <section className="relative isolate bg-background">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-16 sm:px-8 sm:py-24">
          <SectionHeading
            eyebrow="شفافیت"
            title="پیشنهادها چطور انتخاب می‌شوند"
            description="هیچ بخشی از نتیجه به شانس یا حدس سپرده نشده است."
          />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="flex flex-col gap-4 text-sm leading-9 text-muted">
              <p>
                فیلتر موجودی، امتیازدهی وزنی و رتبه‌بندی عطرها کاملاً قطعی و در خود
                برنامه انجام می‌شود: هر بار با همان پاسخ‌ها، همان ترتیب پیشنهادها ساخته
                می‌شود. عطرهای غیرفعال یا ناموجود وارد لیست نمی‌شوند و نتیجه به فروشگاه
                انتخابی تو محدود می‌ماند.
              </p>
              <p>
                هوش مصنوعی فقط یک کار دارد: نوشتن توضیح فارسی «چرا این عطر؟». اگر سرویس
                هوش مصنوعی در دسترس نباشد، همان لیست قطعی بدون آن توضیح نمایش داده
                می‌شود — نه پیام خطا، نه لیست جایگزین.
              </p>
            </div>

            <aside className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-6">
              <span className="eyebrow flex items-center gap-2 text-champagne-deep">
                <StarMark className="h-3 w-3" />
                نُه بُعد سلیقه
              </span>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted">
                {PERSONALITY_DIMENSIONS.map((dimension) => (
                  <li key={dimension} className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-1 w-1 rounded-full bg-champagne-deep/70" />
                    {PERSONALITY_LABELS[dimension]}
                  </li>
                ))}
              </ul>
              <hr className="hairline" />
              <p className="text-xs leading-7 text-muted">
                هر بُعد از ۰ تا ۱۰۰ نمره می‌گیرد و در صفحهٔ نتیجه به‌صورت نمودار قابل
                خواندن است.
              </p>
            </aside>
          </div>
        </div>
      </section>

      {/* ================= 5 · closing action (night panel on ivory) ============ */}
      <section className="bg-background">
        <div className="mx-auto w-full max-w-5xl px-5 pb-16 sm:px-8 sm:pb-24">
          <div
            data-surface="dark"
            className="relative isolate overflow-hidden rounded-[var(--radius-lg)] border border-indigo/40"
          >
            <CosmicBackdrop stars={38} seed={5} grain intensity={0.85} constellation />
            <div className="relative z-10 flex flex-col gap-5 px-6 py-12 text-center sm:px-12 sm:py-16">
              <span className="eyebrow mx-auto flex items-center gap-2 text-champagne">
                <StarMark className="h-3.5 w-3.5" />
                آماده‌ای؟
              </span>
              <h2 className="display-lg mx-auto max-w-xl text-ivory">
                امروز رایحه‌ات را پیدا کن
              </h2>
              <p className="mx-auto max-w-md text-sm leading-8 text-muted">
                ۱۰ سؤال، کمتر از دو دقیقه. نتیجه همان‌جا در مرورگرت ساخته می‌شود.
              </p>
              <Link
                href="/quiz"
                className="btn-primary mx-auto mt-2 flex min-h-12 items-center gap-2 rounded-full px-8 text-base font-medium"
              >
                شروع آزمون سلیقه
                <ArrowLeftMark className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
