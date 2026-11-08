"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_ACCESS_PATH,
  adminAccessCookieOptions,
  constantTimeEqual,
  hashAdminSecret,
  isAdminAccessConfigured,
  mintAdminAccessToken,
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
 * hardening). Every admin page and action guards itself through
 * `lib/admin/server-access.ts`; this is the only place a credential is issued.
 *
 * The browser receives neither the secret nor its SHA-256 hash: the hash
 * comparison is only what gates the unlock, and the httpOnly cookie carries a
 * signed, expiring token (`v1.<expiresAt>.<hmac>`) minted from the secret. The
 * raw secret exists only in the server env.
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
  //
  // Fail CLOSED: if the counter table is unreachable we cannot know how many
  // attempts this requester has already made, so the unlock is refused with the
  // ordinary generic lockout — never granted unthrottled. Public endpoints keep
  // the limiter's default fail-open behaviour.
  const attemptLimit = await checkRateLimit(
    unlockKey,
    PUBLIC_RATE_LIMITS.adminUnlock,
    Date.now(),
    { failClosed: true },
  );
  if (!attemptLimit.allowed) {
    gateRedirect(nextPath, ADMIN_UNLOCK_REDIRECT_ERROR);
  }

  const submitted = formData.get("secret");
  if (typeof submitted !== "string" || submitted === "") {
    gateRedirect(nextPath, "wrong");
  }

  // Constant-time, like the token check: a plain `!==` walks the hash byte by
  // byte and leaks how much of a guess was right.
  const [submittedHash, expectedHash] = await Promise.all([
    hashAdminSecret(submitted),
    hashAdminSecret(secret),
  ]);
  if (!constantTimeEqual(submittedHash, expectedHash)) {
    gateRedirect(nextPath, "wrong");
  }

  await clearRateLimit(unlockKey);
  const host = headersList.get("host") ?? "";
  const token = await mintAdminAccessToken(secret);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_ACCESS_COOKIE, token, adminAccessCookieOptions(host));

  revalidatePath("/admin", "layout");

  // Open-redirect guard: only admin-relative destinations are honored.
  redirect(nextPath);
}

export async function logoutAdminAccessAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_ACCESS_COOKIE, "", { ...adminAccessCookieOptions(), maxAge: 0 });
  redirect(ADMIN_ACCESS_PATH);
}
