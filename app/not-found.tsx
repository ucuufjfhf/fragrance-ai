import Link from "next/link";

import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";

/**
 * GET a URL this app does not serve — the branded 404.
 *
 * A dead link is still a visit from a shopper, so this page carries the same
 * chrome as every other public page and offers the one action the brand cares
 * about. It is a static Server Component: no client JS, no data access, no
 * redirect. Next returns the 404 status and injects `noindex` itself.
 *
 * Built from the shared primitives only — `SiteHeader`, `SiteFooter`, the
 * bundled FIAGE mark (a plain <img>, exactly as the header uses it) and the
 * same `.btn-primary` tier as the hero — so the page cannot drift from the
 * rest of the site's design language.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8">
        <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
          {/* Bundled public/ asset, not merchant data: a plain <img> keeps the
              exact file, with no loader in between. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/fiage-mark.png"
            alt="FIAGE"
            width={560}
            height={560}
            className="h-16 w-16 shrink-0 object-contain"
          />

          <h1 className="font-heading text-3xl font-bold leading-[1.3] text-foreground sm:text-4xl">
            این صفحه پیدا نشد
          </h1>

          <p className="text-base leading-loose text-muted">
            ممکنه آدرس رو اشتباه نوشته باشید، یا این صفحه جابه‌جا شده باشه.
          </p>

          <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/quiz"
              className="btn-primary flex min-h-14 items-center justify-center px-9 text-lg font-medium text-background"
            >
              شروع آزمون
            </Link>
            <Link
              href="/"
              className="flex min-h-11 items-center justify-center px-5 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              بازگشت به خانه
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
