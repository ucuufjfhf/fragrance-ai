import type { AnalyticsEventType } from "@/lib/analytics/types";

/**
 * Copy data for the public /data-policy page.
 *
 * These live OUTSIDE `app/data-policy/page.tsx` on purpose: a Next.js page
 * module may only export the default component and the route's own fields
 * (`metadata`, `generateMetadata`, ...). Anything else lands in the generated
 * build validator `.next/types/app/data-policy/page.ts` and fails the
 * production type check with "incompatible with index signature" — which is
 * exactly what broke the Windows deploy. Keeping the data here means the page
 * exports only what Next allows, while the copy test still imports the same
 * values rather than re-typing them.
 *
 * `EVENT_LABELS` stays an exhaustive `Record<AnalyticsEventType, string>`:
 * adding an event to the analytics contract without a plain-language label is
 * still a type error, so the page can never quietly fall out of date with what
 * is actually recorded.
 */

/** What the widget actually records — one entry per real data category. */
export const COLLECTED_DATA = [
  {
    title: "پاسخ‌های شما به ۱۰ سؤال",
    detail: "همان گزینه‌هایی که انتخاب می‌کنید؛ بدون نام، بدون حساب کاربری.",
  },
  {
    title: "پروفایل عطری ۹محوره",
    detail: "برای هر محور یک عدد بین ۰ تا ۱۰۰ که فقط از پاسخ‌های خودتان محاسبه می‌شود.",
  },
  {
    title: "یک توکن نشست ناشناس",
    detail:
      "یک رشتهٔ تصادفی در حافظهٔ همان تب مرورگر؛ فقط برای اینکه رویدادهای یک تلاش به هم وصل شوند و با بستن تب پاک می‌شود.",
  },
  {
    title: "رویدادهای آماری",
    detail: "فقط نام رویداد و شناسهٔ فروشگاه؛ فهرست کامل در بخش بعدی آمده است.",
  },
] as const;

/** Categories the widget never asks for — stated so nobody has to guess. */
export const NOT_COLLECTED = [
  "نام و نام خانوادگی",
  "ایمیل",
  "شماره تلفن",
  "آدرس",
  "اطلاعات پرداخت",
  "شماره کارت",
  "موقعیت مکانی",
] as const;

/** Plain-language label for every canonical event. Exhaustive by type. */
export const EVENT_LABELS: Record<AnalyticsEventType, string> = {
  QUIZ_STARTED: "شروع آزمون",
  QUIZ_COMPLETED: "تکمیل آزمون",
  RESULT_VIEWED: "دیدن نتیجه",
  RECOMMENDATIONS_SHOWN: "نمایش پیشنهادها",
  PERFUME_CLICKED: "کلیک روی یک عطر",
  WIDGET_VIEWED: "باز شدن ویجت",
};

export const CONTACT_EMAIL = "majidemoon0@gmail.com";
