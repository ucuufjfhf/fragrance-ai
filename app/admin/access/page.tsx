import { unlockAdminAccessAction } from "@/app/admin/access/actions";
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
  title: "ورود مدیریت | عطر خودتو پیدا کن",
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold">ورود مدیریت</h1>
        <p className="text-sm leading-8 text-muted">
          این بخش ویژهٔ مدیر فروشگاه است. برای مشاهدهٔ مدیریت عطرها و آمار،
          گذرواژهٔ مدیریت را وارد کنید.
        </p>
      </header>

      {unlockError ? (
        <p role="alert" className="rounded-2xl border border-red-400/40 p-4 text-sm leading-8 text-red-400">
          {unlockError}
        </p>
      ) : null}

      {!configured ? (
        <p role="alert" className="rounded-2xl border border-red-400/40 p-4 text-sm leading-8 text-red-400">
          {MESSAGES.notConfigured}
        </p>
      ) : (
        <form action={unlockAdminAccessAction} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={nextPath} />
          <label className="flex flex-col gap-1 text-sm" htmlFor="admin-secret">
            گذرواژهٔ مدیریت
          </label>
          <input
            id="admin-secret"
            name="secret"
            type="password"
            required
            autoComplete="current-password"
            dir="ltr"
            className="min-h-12 rounded-2xl border border-border-soft bg-surface px-4 text-left"
          />
          <button
            type="submit"
            className="min-h-12 rounded-2xl bg-accent px-5 font-medium text-background transition-colors hover:bg-accent/90"
          >
            ورود
          </button>
        </form>
      )}
    </main>
  );
}
