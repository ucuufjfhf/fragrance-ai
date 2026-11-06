import type { Metadata } from "next";

import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import { ANALYTICS_EVENT_TYPES } from "@/lib/analytics/types";
import {
  COLLECTED_DATA,
  CONTACT_EMAIL,
  EVENT_LABELS,
  NOT_COLLECTED,
} from "@/lib/data-policy/content";

/**
 * GET /data-policy — the public answer to «داده‌ی مشتری من دست کیه؟».
 *
 * Everything here is derived from the code beside it, not from a template:
 *
 *  - the ten questions and the nine-axis profile come from the quiz engine;
 *  - the anonymous token is `lib/analytics/flow-tracker.ts` (sessionStorage, one
 *    attempt, no identity);
 *  - the event list is `ANALYTICS_EVENT_TYPES` itself, rendered through a
 *    `Record<AnalyticsEventType, string>` — so adding an event to the contract
 *    without a plain-language label is a TYPE error, and the page can never
 *    quietly fall out of date with what is actually recorded;
 *  - the copy lives in `lib/data-policy/content.ts`, not here: a page module may
 *    export only `metadata` and the default component, or Next's generated build
 *    validator rejects it and the production type check fails.
 *
 * Honesty rules this page keeps: no retention period is promised (none is
 * implemented), merchant export/deletion is stated as on-request (there is no
 * self-serve mechanism), and no contact path other than the address already
 * public on /about.
 */

export const metadata: Metadata = {
  title: "حریم خصوصی و داده‌ها | FIAGE",
  description:
    "چه داده‌هایی در فیاژ جمع می‌شود، کجا نگه داشته می‌شود و هر فروشگاه چه چیزی می‌بیند.",
};

export default function DataPolicyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-3xl px-5 pb-6 pt-12 sm:px-8 lg:pt-20">
          <p className="text-sm font-medium text-muted">حریم خصوصی و داده‌ها</p>
          <h1 className="mt-2 font-heading text-4xl font-bold leading-[1.3] text-foreground sm:text-5xl">
            داده‌ی شما، شفاف و کم
          </h1>
          <p className="mt-5 leading-loose text-foreground/90">
            فیاژ بدون ثبت‌نام کار می‌کند. این صفحه دقیقاً می‌گوید چه چیزی ذخیره
            می‌شود، چه چیزی هرگز پرسیده نمی‌شود، و هر فروشگاه چه چیزی می‌بیند —
            همان چیزی که در کد همین سرویس انجام می‌شود.
          </p>
        </section>

        {/* What is collected */}
        <section aria-labelledby="collected" className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
          <h2 id="collected" className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
            چه چیزی ذخیره می‌شود؟
          </h2>
          <ul className="mt-6 flex flex-col gap-4">
            {COLLECTED_DATA.map((item) => (
              <li
                key={item.title}
                className="rounded-2xl border border-border-soft bg-surface p-5"
              >
                <h3 className="font-heading text-base font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm leading-loose text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>

          <h3 className="mt-8 font-heading text-lg font-semibold text-foreground">
            رویدادهای آماری، یکی‌یکی
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {ANALYTICS_EVENT_TYPES.map((eventType) => (
              <li
                key={eventType}
                className="rounded-full border border-border-soft bg-surface-2 px-3 py-1 text-xs text-muted"
              >
                {EVENT_LABELS[eventType]}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-loose text-muted">
            هر رویداد فقط می‌گوید «چه اتفاقی افتاد» و «در کدام فروشگاه»؛ هیچ
            محتوای پاسخ‌ها داخل رویداد نوشته نمی‌شود.
          </p>
        </section>

        {/* What is never collected */}
        <section
          aria-labelledby="not-collected"
          className="border-y border-border-soft bg-surface-2"
        >
          <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
            <h2
              id="not-collected"
              className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
            >
              چه چیزی هرگز پرسیده نمی‌شود؟
            </h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {NOT_COLLECTED.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-foreground/90">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-loose text-muted">
              ویجت هیچ فرم ثبت‌نام، پرداخت یا تماسی ندارد؛ فقط ده سؤال سلیقه و
              سه پیشنهاد.
            </p>
          </div>
        </section>

        {/* Who sees what */}
        <section aria-labelledby="who-sees" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
          <h2 id="who-sees" className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
            چه کسی چه چیزی می‌بیند؟
          </h2>
          <div className="mt-6 flex flex-col gap-4 text-sm leading-loose text-foreground/90">
            <p>
              پاسخ‌ها و رویدادها در پایگاه‌دادهٔ پلتفرم فیاژ ذخیره می‌شوند. هر
              فروشگاه فقط{" "}
              <strong className="font-semibold">گزارش تجمیعی خودش</strong> را
              می‌بیند: تعداد بازدید ویجت، شروع و تکمیل آزمون، نمایش پیشنهادها،
              کلیک‌ها و فهرست عطرهایی که بیشتر پیشنهاد شده‌اند. پاسخ‌های فردی و
              هویت هیچ‌کس در آن گزارش نیست.
            </p>
            <p>
              گزارش هر فروشگاه از طریق یک پیوند محرمانه در اختیار خودش قرار
              می‌گیرد؛ آن پیوند را فقط با صاحب همان فروشگاه به اشتراک می‌گذاریم.
            </p>
            <p>
              کاتالوگ عطرها متعلق به همان فروشگاه است. اگر بخواهید کاتالوگ‌تان
              خارج شود یا حذف شود، با ایمیل زیر هماهنگ می‌کنیم؛ در حال حاضر این
              کار به‌صورت درخواستی انجام می‌شود و سازوکار خودکار در محصول وجود
              ندارد.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section aria-labelledby="privacy-contact" className="mx-auto w-full max-w-3xl px-5 pb-14 text-center sm:px-8">
          <h2
            id="privacy-contact"
            className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
          >
            سؤالی دربارهٔ داده‌ها دارید؟
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-loose text-muted">
            هر سؤالی دربارهٔ اینکه چه چیزی ذخیره می‌شود، چرا، یا برای حذف آن،
            مستقیم ایمیل بزنید.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
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
