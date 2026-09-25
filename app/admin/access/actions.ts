"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_ACCESS_PATH,
  adminAccessCookieOptions,
  adminAccessCookieValue,
  hashAdminSecret,
  isAdminAccessConfigured,
  safeAdminRedirectPath,
} from "@/lib/admin/access";
import {
  ADMIN_UNLOCK_REDIRECT_ERROR,
  PUBLIC_RATE_LIMITS,
  checkRateLimit,
  clearRateLimit,
  requesterIdentity,
} from "@/lib/rate-limit";

/**
 * The unlock server action for the admin access gate (pre-deployment
 * hardening). Defense in depth: the proxy already gates the /admin network
 * path; this re-checks server-side before any cookie is issued.
 *
 * The browser receives only the secret's SHA-256 HASH (in an httpOnly
 * cookie) — never the raw secret, which exists only in the server env.
 *
 * Plain-form action signature (React 19 server form action): outcomes are
 * communicated through redirects, so the page can render the right Persian
 * message from the query string without a client-side state hook.
 */

const ERROR_PARAM = "error";

function gateRedirect(nextPath: string, error?: "wrong" | "config" | typeof ADMIN_UNLOCK_REDIRECT_ERROR): never {
  const params = new URLSearchParams();
  params.set("next", safeAdminRedirectPath(nextPath));
  if (error) {
    params.set(ERROR_PARAM, error);
  }
  redirect(`${ADMIN_ACCESS_PATH}?${params.toString()}`);
}

export async function unlockAdminAccessAction(formData: FormData): Promise<void> {
  const rawNext = formData.get("next");
  const nextPath = safeAdminRedirectPath(typeof rawNext === "string" ? rawNext : null);

  const secret = process.env.ADMIN_ACCESS_SECRET;
  if (!isAdminAccessConfigured(secret)) {
    // Fail closed, with an operator-actionable (server-side) explanation.
    gateRedirect(nextPath, "config");
  }

  const headersList = await headers();
  const unlockRequest = new Request("https://admin.local/admin/access", {
    headers: headersList,
  });
  const unlockKey = `admin:unlock:${requesterIdentity(unlockRequest)}`;

  // Only failed attempts consume quota. Locked and unlocked states use the
  // same generic outcome so this gate reveals nothing about the configured value.
  const attemptLimit = checkRateLimit(unlockKey, PUBLIC_RATE_LIMITS.adminUnlock);
  if (!attemptLimit.allowed) {
    gateRedirect(nextPath, ADMIN_UNLOCK_REDIRECT_ERROR);
  }

  const submitted = formData.get("secret");
  if (typeof submitted !== "string" || submitted === "") {
    gateRedirect(nextPath, "wrong");
  }

  const [submittedHash, expectedHash] = await Promise.all([
    hashAdminSecret(submitted),
    adminAccessCookieValue(secret),
  ]);
  if (submittedHash !== expectedHash) {
    gateRedirect(nextPath, "wrong");
  }

  clearRateLimit(unlockKey);
  const host = headersList.get("host") ?? "";
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_ACCESS_COOKIE, expectedHash, adminAccessCookieOptions(host));

  revalidatePath("/admin", "layout");

  // Open-redirect guard: only admin-relative destinations are honored.
  redirect(nextPath);
}
