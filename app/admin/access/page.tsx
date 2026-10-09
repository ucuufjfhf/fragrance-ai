import { unlockAdminAccessAction } from "@/app/admin/access/actions";
import { CosmicBackdrop } from "@/components/cosmic/cosmic-visuals";
import { StarMark } from "@/components/ui-icons";
import { isAdminAccessConfigured, safeAdminRedirectPath } from "@/lib/admin/access";

/**
 * «ورود مدیریت» — the shared-secret gate page (pre-deployment hardening).
 *
 * The operator submits the configured `ADMIN_ACCESS_SECRET`; on a match an
 * httpOnly cookie holding ONLY the secret's SHA-256 hash is set (the raw
 * secret never travels back to the browser, never enters the database, and
 * is never rendered). The page itself carries no admin data, so leaving it
 * reachable through the proxy is harmless.
 */

export const metadata = {
  title: "ورود مدیریت | فیاج",
  robots: { index: false, follow: false },
};

interface AdminAccessPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const MESSAGES = {
  notConfigured:
    "دسترسی مدیریت پیکربندی نشده است. متغیر ADMIN_ACCESS_SECRET را در تنظیمات سرور تعیین کنید.",
  wrongSecret: "گذرواژه نادرست است؛ دوباره تلاش کنید.",
  rateLimited: "تلاش‌ها بیش از حد مجاز بود؛ لطفاً بعداً دوباره امتحان کنید.",
} as const;

export default async function AdminAccessPage({ searchParams }: AdminAccessPageProps) {
  const params = await searchParams;
  const nextPath = safeAdminRedirectPath(first(params.next));
  const configured = isAdminAccessConfigured(process.env.ADMIN_ACCESS_SECRET);
  // Redirect-based outcomes from the unlock action (plain server-action form).
  const unlockError =
    first(params.error) === "wrong"
      ? MESSAGES.wrongSecret
      : first(params.error) === "config"
        ? MESSAGES.notConfigured
        : first(params.error) === "rate_limited"
          ? MESSAGES.rateLimited
          : null;

  return (
    <main
      data-surface="dark"
      className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden horizon px-4 py-16"
    >
      <CosmicBackdrop stars={40} seed={31} constellation intensity={0.7} />
      <section className="relative z-10 flex w-full max-w-md flex-col gap-6 rounded-[var(--radius-lg)] border border-border-soft bg-surface/80 p-6 sm:p-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-champagne/40"
          >
            <StarMark className="h-4 w-4 text-champagne" />
          </span>
          <h1 className="display-md text-ivory">ورود مدیریت</h1>
          <p className="text-xs leading-7 text-muted">
            این بخش ویژهٔ مدیر فروشگاه است. برای مشاهدهٔ مدیریت عطرها و آمار، گذرواژهٔ
            مدیریت را وارد کنید.
          </p>
        </header>

        {unlockError ? (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] border border-nebula/40 bg-nebula/10 p-3.5 text-xs leading-7 text-nebula"
          >
            {unlockError}
          </p>
        ) : null}

        {!configured ? (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] border border-nebula/40 bg-nebula/10 p-3.5 text-xs leading-7 text-nebula"
          >
            {MESSAGES.notConfigured}
          </p>
        ) : (
          <form action={unlockAdminAccessAction} className="flex flex-col gap-3">
            <input type="hidden" name="next" value={nextPath} />
            <label className="flex flex-col gap-1.5 text-xs text-muted" htmlFor="admin-secret">
              گذرواژهٔ مدیریت
            </label>
            <input
              id="admin-secret"
              name="secret"
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              className="min-h-12 rounded-[var(--radius-md)] border border-border-soft bg-night/60 px-4 text-left text-sm text-ivory placeholder:text-muted/70"
            />
            <button
              type="submit"
              className="btn-primary flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-medium"
            >
              ورود
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
