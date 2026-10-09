import Link from "next/link";

import { CosmicBackdrop } from "@/components/cosmic/cosmic-visuals";
import { BottleMark, StarMark } from "@/components/ui-icons";

/**
 * Closing night sky. Carries the brand line, the real destinations and the
 * honest disclaimer that this is a taste analysis, not a psychological test.
 */
export default function SiteFooter() {
  return (
    <footer data-surface="dark" className="relative isolate mt-auto overflow-hidden horizon">
      <CosmicBackdrop stars={34} seed={23} grain intensity={0.8} constellation={false} />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-14 sm:px-8 sm:py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <span className="flex items-center gap-2.5">
              <StarMark className="h-4 w-4 text-champagne" />
              <span dir="ltr" className="font-display text-lg text-ivory">
                FIAgÉ
              </span>
            </span>
            <p className="max-w-sm text-sm leading-8 text-muted">
              انتخاب عطر، یک کشف شخصی است. فیاج با یک آزمون کوتاه، پروفایل عطری تو
              را می‌سازد و از میان موجودی واقعی فروشگاه‌ها، نزدیک‌ترین رایحه‌ها را
              پیشنهاد می‌دهد.
            </p>
          </div>

          <nav aria-label="پیوندهای پانویس" className="flex flex-col gap-2 text-sm">
            <span className="eyebrow text-champagne/80">مسیرها</span>
            <Link href="/" className="text-muted transition-colors hover:text-ivory">
              صفحهٔ اصلی
            </Link>
            <Link href="/quiz" className="text-muted transition-colors hover:text-ivory">
              آزمون سلیقه عطری
            </Link>
            <Link
              href="/admin/access"
              className="text-muted transition-colors hover:text-ivory"
            >
              ورود مدیر فروشگاه
            </Link>
          </nav>
        </div>

        <hr className="hairline" />

        <div className="flex flex-col gap-2 text-xs leading-7 text-muted sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <BottleMark className="h-4 w-4 text-celestial" />
            نتیجهٔ آزمون یک تحلیل سلیقه‌ای برای انتخاب عطر است، نه یک تست روانشناسی.
          </span>
          <span className="tnum">© ۱۴۰۵ فیاژ</span>
        </div>
      </div>
    </footer>
  );
}
