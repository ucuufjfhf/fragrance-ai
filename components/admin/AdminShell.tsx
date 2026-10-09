import Link from "next/link";

import { logoutAdminAccessAction } from "@/app/admin/access/actions";
import { StarMark } from "@/components/ui-icons";

const WIDTHS = {
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
} as const;

const NAV_ITEMS = [
  { href: "/admin/perfumes", label: "عطرها", key: "perfumes" },
  { href: "/admin/analytics", label: "آمار", key: "analytics" },
] as const;

interface AdminShellProps {
  title: string;
  description?: string;
  /** Marks the active section for assistive tech (aria-current). */
  current?: "perfumes" | "analytics";
  width?: keyof typeof WIDTHS;
  children: React.ReactNode;
}

/**
 * The single chrome for every admin screen: a slim night-coloured bar carrying
 * the section navigation and the sign-out action, then a calm ivory work area.
 *
 * Admin surfaces stay utilitarian — one navy bar, one heading, one content
 * column — so tables and forms keep the full attention budget.
 */
export default function AdminShell({
  title,
  description,
  current,
  width = "lg",
  children,
}: AdminShellProps) {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <div data-surface="dark" className="border-b border-border-soft/70 bg-night">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <span className="flex items-center gap-2.5 text-sm text-ivory">
            <StarMark className="h-3.5 w-3.5 text-champagne" />
            پنل مدیریت فیاج
          </span>

          <nav aria-label="ناوبری مدیریت" className="flex items-center gap-1.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={current === item.key ? "page" : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                  current === item.key
                    ? "border-champagne/50 bg-champagne/10 text-champagne"
                    : "border-transparent text-muted hover:border-border-soft hover:text-ivory"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <form action={logoutAdminAccessAction}>
              <button
                type="submit"
                className="rounded-full border border-transparent px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-border-soft hover:text-ivory"
              >
                خروج
              </button>
            </form>
          </nav>
        </div>
      </div>

      <div
        className={`mx-auto flex w-full ${WIDTHS[width]} flex-1 flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10`}
      >
        <header className="flex flex-col gap-1.5">
          <h1 className="display-md text-ink">{title}</h1>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </header>
        {children}
      </div>
    </main>
  );
}
