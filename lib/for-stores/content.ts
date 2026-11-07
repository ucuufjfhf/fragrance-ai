/**
 * Copy and constants for the public /for-stores page.
 *
 * Kept OUTSIDE `app/for-stores/page.tsx` for the same reason as
 * `lib/data-policy/content.ts`: a Next.js page module may export only the
 * default component and the route's own fields (`metadata`, ...), or the
 * generated build validator rejects it and the production type check fails.
 *
 * Everything here is traceable to code in this repo:
 *
 *  - the install snippet is the one `public/widget.js` documents and
 *    `docs/store-onboarding-runbook.md` hands to merchants;
 *  - the demo store is the one `prisma/seed.ts` provisions
 *    (`store-demo-perfume-shop` / «عطرسرای نمونه»);
 *  - the report bullets are the sections `app/store-report/[token]/page.tsx`
 *    actually renders;
 *  - the UTM names are the exported constants in `lib/widget/attribution.ts`;
 *  - the data facts repeat `lib/data-policy/content.ts` and
 *    `lib/analytics/flow-tracker.ts`.
 *
 * Deliberately absent: any price, trial duration, uptime/SLA, backup or
 * retention promise, and any inventory count. The page invites a conversation
 * about trial terms instead of publishing numbers the code does not implement.
 */

/** The shipped loader — served from `public/`, same origin as this page. */
export const WIDGET_LOADER_PATH = "/widget.js";

/** The demo store from `prisma/seed.ts`; its id is what the loader receives. */
export const WIDGET_DEMO_STORE_ID = "store-demo-perfume-shop";

/** The same store's merchant-facing name (seed.ts, `Store.name`). */
export const WIDGET_DEMO_STORE_NAME = "عطرسرای نمونه";

/**
 * The attributes of the merchant's loader tag, in one place.
 *
 * The demo (components/for-stores/WidgetDemoEmbed.tsx) applies these to the
 * script it injects after hydration — the identical tag a merchant pastes, not
 * a substitute. They are a constant rather than inline JSX because the script
 * must NOT exist in the server markup: the loader inserts its mount next to its
 * own tag during parse, and React hydration then removes that unknown child.
 * Exporting them lets the copy test assert the exact shipped tag.
 */
export const WIDGET_LOADER_ATTRIBUTES = {
  src: WIDGET_LOADER_PATH,
  "data-store-id": WIDGET_DEMO_STORE_ID,
} as const;

/**
 * The install line a merchant copies. `STORE_ID` is a placeholder on purpose:
 * the real id is printed by `scripts/create-store.ts` per merchant, and no
 * production host is invented here (`NEXT_PUBLIC_APP_URL` is deployment data).
 */
export const WIDGET_INSTALL_SNIPPET =
  '<script src="https://YOUR-DOMAIN/widget.js" data-store-id="STORE_ID"></script>';

/** What the private aggregate report shows — one bullet per rendered section. */
export const REPORT_FACTS = [
  "بازدید ویجت؛ فقط وقتی شمرده می‌شود که ویجت واقعاً در صفحه دیده شود، نه فقط بارگذاری شود.",
  "شروع آزمون، تکمیل آزمون و نرخ تکمیل آزمون.",
  "برای هر عطر: چند بار در پیشنهادها آمده، چند بار کلیک شده و نرخ کلیک.",
] as const;

/** What the widget records — mirrors the /data-policy page's own list. */
export const DATA_FACTS = [
  "نام، شماره تلفن، ایمیل و اطلاعات پرداخت هیچ‌وقت پرسیده نمی‌شود؛ ویجت هیچ فرم ثبت‌نام یا پرداختی ندارد.",
  "برای هر تلاش یک توکن نشست ناشناس در حافظهٔ همان تب ساخته می‌شود، فقط برای اینکه رویدادهای یک تلاش به هم وصل شوند.",
  "هر فروشگاه فقط گزارش تجمیعی خودش را می‌بیند؛ پاسخ‌های فردی و هویت هیچ‌کس در آن گزارش نیست.",
  "کاتالوگ عطرها مال خود فروشگاه است؛ خروجی گرفتن یا حذف آن به‌صورت درخواستی انجام می‌شود.",
] as const;
