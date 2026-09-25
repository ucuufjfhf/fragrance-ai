import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_ACCESS_PATH,
  ADMIN_HOME_PATH,
  isAdminRequestAuthorized,
  safeAdminRedirectPath,
} from "@/lib/admin/access";

/**
 * Server-side admin access gate (Node runtime).
 *
 * This module replaces the network-boundary gate previously provided by
 * `proxy.ts` (removed after it blocked the Netlify Edge Functions bundling):
 * every admin PAGE guards itself through `requireAdmin()` and every admin
 * SERVER ACTION guards itself through `requireAdminAction()`, so protection
 * no longer depends on middleware.
 *
 * The authentication scheme itself is unchanged and lives in the pure,
 * edge-safe helpers of `lib/admin/access.ts` (SHA-256 hash comparison over
 * the `ADMIN_ACCESS_COOKIE`, fail-closed when `ADMIN_ACCESS_SECRET` is
 * missing/empty). This file adds only the Next.js server plumbing
 * (`cookies()`, `redirect()`) — no second auth implementation, no Prisma,
 * no filesystem access, and the raw secret never leaves the server.
 */

/** Whether the current request carries a valid admin access cookie. */
export async function isAdminAuthenticated(): Promise<boolean> {
  const secret = process.env.ADMIN_ACCESS_SECRET;
  const cookieStore = await cookies();
  return isAdminRequestAuthorized(
    cookieStore.get(ADMIN_ACCESS_COOKIE)?.value,
    secret,
  );
}

/**
 * Page guard: continue when authenticated, otherwise redirect to the gate
 * page preserving a validated admin-relative `next` destination.
 *
 * `next` defaults to the admin home (`ADMIN_HOME_PATH`, /admin/perfumes).
 * The value is sanitized by the existing `safeAdminRedirectPath` guard
 * (absolute URLs, protocol-relative URLs and backslash tricks are rejected),
 * so this must only ever be called with admin-relative intent.
 */
export async function requireAdmin(next?: string): Promise<void> {
  if (await isAdminAuthenticated()) {
    return;
  }

  const target = safeAdminRedirectPath(next ?? ADMIN_HOME_PATH);
  const params = new URLSearchParams();
  params.set("next", target);
  redirect(`${ADMIN_ACCESS_PATH}?${params.toString()}`);
}

/**
 * Action guard: continue when authenticated, otherwise redirect to the gate
 * page. Must run as the FIRST meaningful operation of every privileged
 * admin action, before any DB/AI/mutation work — `redirect()` throws a
 * Next.js control-flow error, so it must never be swallowed by a try/catch
 * inside the caller.
 */
export async function requireAdminAction(): Promise<void> {
  if (await isAdminAuthenticated()) {
    return;
  }
  redirect(ADMIN_ACCESS_PATH);
}
