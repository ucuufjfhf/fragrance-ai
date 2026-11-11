import type { Metadata } from "next";
import Link from "next/link";

import WidgetDemoEmbed from "@/components/for-stores/WidgetDemoEmbed";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import { CONTACT_EMAIL } from "@/lib/data-policy/content";
import {
  DATA_FACTS,
  REPORT_FACTS,
  WIDGET_DEMO_STORE_ID,
  WIDGET_DEMO_STORE_NAME,
  WIDGET_INSTALL_SNIPPET,
  WIDGET_LOADER_PATH,
} from "@/lib/for-stores/content";

/**
 * GET /for-stores — the merchant-facing page the outreach message points at.
 *
 * The homepage is a shopper's page and says nothing about selling the widget,
 * so a store owner arriving from an email had no landing. This is that landing:
 * what the widget is, a LIVE demo of it, what the private report shows, and
 * what the data policy guarantees.
 *
 * Honesty rules this page keeps (each one is pinned by
 * `tests/for-stores/for-stores-page.test.tsx`):
 *
 *  - the demo is the real thing, not a mock: the shipped `public/widget.js`
 *    loader, same origin, pointed at the seed's demo store;
 *  - the report section describes only the sections `app/store-report/[token]`
 *    renders — funnel views/starts/completions, and per-perfume impressions,
 *    clicks and click rate;
 *  - it says plainly that clicks are tagged and sales are not measured;
 *  - no price, no trial duration, no uptime/SLA, no backup or retention
 *    promise, and no inventory count: the CTA invites a conversation about
 *    terms instead of publishing numbers the code cannot back.
 *
 * The page is a server component and ships no client JS of its own; the only
 * JavaScript on it is the merchant's loader, loaded exactly as a merchant's
 * page would load it.
 */

export const metadata: Metadata = {
  title: "برای فروشگاه‌ها | FIAGE",
  description:
    "ویجت آزمون سلیقهٔ فیاژ روی فروشگاه شما: پیشنهاد از موجودی خودتان، گزارش تجمیعی محرمانه و یک نمونهٔ زنده.",
};

export default function ForStoresPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        {/* --- Intro --- */}
        <section className="mx-auto w-full max-w-3xl px-5 pb-6 pt-12 sm:px-8 lg:pt-20">
          <p className="text-sm font-medium text-muted">برای فروشگاه‌ها</p>
          <h1 className="mt-2 font-heading text-4xl font-bold leading-[1.3] text-foreground sm:text-5xl">
            ویجت عطر، روی موجودی خودتان
          </h1>
          <p className="mt-5 leading-loose text-foreground/90">
            فیاژ یک ویجت آزمون سلیقه است که در صفحهٔ فروشگاه شما می‌نشیند.
            مشتری به ده سؤال کوتاه جواب می‌دهد و پیشنهادها از میان عطرهایی
            انتخاب می‌شوند که خودتان در کاتالوگ دارید — نه از یک فهرست عمومی.
          </p>
        </section>

        {/* --- Install --- */}
        <section
          aria-labelledby="for-stores-install"
          className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8"
        >
          <h2
            id="for-stores-install"
            className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
          >
            نصب، یک خط است
          </h2>
          <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-6 sm:p-8">
            <p className="leading-loose text-foreground/90">
              ویجت با یک تگ اسکریپت نصب می‌شود. اسکریپت شناسهٔ فروشگاه شما را از{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-sm" dir="ltr">
                data-store-id
              </code>{" "}
              می‌خواند و یک iframe از همان دامنهٔ فیاژ در صفحه می‌سازد؛ استایل‌های
              سایت شما و ویجت به هم نفوذ نمی‌کنند.
            </p>
            {/* A plain paragraph with the snippet as its direct text child —
                deliberately not <pre><code>: measured in Chrome, both the
                <pre> form and a block <code> in this RTL column laid out at
                0px height and painted nothing, while the text renders normally
                as ordinary paragraph content. `dir="ltr"` keeps the tag
                readable; `break-all` wraps the long line. */}
            <p
              dir="ltr"
              className="w-full whitespace-pre-wrap break-all rounded-2xl border border-border-soft bg-surface-2 p-4 text-left text-xs leading-6 text-foreground/90 sm:text-sm"
            >
              {WIDGET_INSTALL_SNIPPET}
            </p>
            <p className="text-sm leading-loose text-muted">
              جای STORE_ID شناسهٔ فروشگاه شما می‌نشیند؛ همین شناسه هنگام
              راه‌اندازی در اختیارتان قرار می‌گیرد.
            </p>
          </div>
        </section>

        {/* --- Live demo: the shipped loader, same origin, real demo store --- */}
        <section
          aria-labelledby="for-stores-demo"
          className="border-y border-border-soft bg-surface-2"
        >
          <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
            <h2
              id="for-stores-demo"
              className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
            >
              همین‌جا امتحانش کنید
            </h2>
            <p className="mt-4 leading-loose text-foreground/90">
              این نمونه با فروشگاه نمایشی «{WIDGET_DEMO_STORE_NAME}» کار می‌کند و
              همان ویجتی است که روی سایت شما نصب می‌شود — با همان اسکریپت، از همین
              دامنه. یک‌بار تا آخر بروید و نتیجه را ببینید.
            </p>

            <p className="mt-4 leading-loose text-foreground/90">
              در نتیجهٔ آزمون، مشتری نمودار رایحهٔ خودش را روی پنج محور می‌بیند و
              می‌تواند هر دو تا از سه پیشنهاد اول را رودررو مقایسه کند — همه داخل
              همان ویجت، روی موجودی شما.
            </p>

            <div
              data-for-stores-demo=""
              data-store-id={WIDGET_DEMO_STORE_ID}
              data-widget-loader={WIDGET_LOADER_PATH}
              className="mt-8 flex flex-col items-center rounded-3xl border border-border-soft bg-background p-4 sm:p-6"
            >
              {/* The merchant's install line, verbatim: the shipped `/widget.js`,
                  same origin, with the demo store's id — injected after mount
                  so React hydration cannot remove the iframe it creates (see
                  components/for-stores/WidgetDemoEmbed.tsx). */}
              <WidgetDemoEmbed />
            </div>

            <p className="mt-4 text-sm leading-loose text-muted">
              ارتفاع ویجت خودکار با محتوایش تنظیم می‌شود؛ عرضش عمداً محدود مانده
              تا همان چیزی باشد که در ستون کنار محصولات یک فروشگاه جا می‌شود.
            </p>
          </div>
        </section>

        {/* --- Report --- */}
        <section
          aria-labelledby="for-stores-report"
          className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8"
        >
          <h2
            id="for-stores-report"
            className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
          >
            گزارش، بدون حدس
          </h2>
          <p className="mt-4 leading-loose text-foreground/90">
            برای هر فروشگاه یک پیوند گزارش محرمانه ساخته می‌شود
            (<span dir="ltr">/store-report/&lt;token&gt;</span>). خودِ آن پیوند
            دسترسی است: هر کسی که آن را داشته باشد گزارش تجمیعی همان فروشگاه را
            می‌بیند، و هیچ فروشگاهی گزارش فروشگاه دیگر را نمی‌بیند.
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {REPORT_FACTS.map((fact) => (
              <li
                key={fact}
                className="flex items-start gap-3 rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm leading-loose text-foreground/90"
              >
                <span
                  aria-hidden="true"
                  className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-loose text-muted">
            کلیک خروجی به سایت شما با UTM علامت می‌خورد (
            <span dir="ltr">utm_source=fiage_widget</span>،{" "}
            <span dir="ltr">utm_medium=quiz</span>،{" "}
            <span dir="ltr">utm_campaign=&lt;slug فروشگاه&gt;</span>) و در تحلیل
            خودتان قابل تشخیص است. اما فروش اندازه‌گیری نمی‌شود: فیاژ نه پیکسل
            تبدیل دارد و نه رقمی برای فروش نشان می‌دهد. عددهایی که می‌بینید رفتار
            بازدیدکننده است، نه درآمد.
          </p>
        </section>

        {/* --- Data & security --- */}
        <section
          aria-labelledby="for-stores-data"
          className="border-y border-border-soft bg-surface-2"
        >
          <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
            <h2
              id="for-stores-data"
              className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
            >
              داده و امنیت
            </h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {DATA_FACTS.map((fact) => (
                <li
                  key={fact}
                  className="flex items-start gap-3 rounded-xl border border-border-soft bg-background px-4 py-3 text-sm leading-loose text-foreground/90"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm leading-loose text-muted">
              جزئیات کامل در{" "}
              <Link
                href="/data-policy"
                className="underline underline-offset-4 transition-colors hover:text-foreground"
              >
                حریم خصوصی و داده‌ها
              </Link>
              .
            </p>
          </div>
        </section>

        {/* --- Contact --- */}
        <section
          aria-labelledby="for-stores-contact"
          className="mx-auto w-full max-w-3xl px-5 py-14 text-center sm:px-8 lg:py-20"
        >
          <h2
            id="for-stores-contact"
            className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
          >
            صحبت کنیم
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-loose text-muted">
            اگر می‌خواهید ویجت را روی فروشگاه خودتان ببینید، ایمیل بزنید؛ دربارهٔ
            شرایط دورهٔ آزمایشی و ادامهٔ کار با هم صحبت می‌کنیم.
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
