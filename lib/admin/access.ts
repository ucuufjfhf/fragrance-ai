/**
 * Pure helpers for the minimal admin access gate (pre-deployment hardening).
 *
 * MVP threat model: the admin surface manages merchant inventory and reads
 * analytics, so on any deployment outside localhost it must not be publicly
 * reachable. This is a shared-secret GATE, not an authentication system —
 * no accounts, no roles, no sessions beyond a short-lived cookie.
 *
 * Mechanics:
 *  - the operator configures `ADMIN_ACCESS_SECRET` (server-side env only);
 *  - the browser never receives the secret: the unlock action compares
 *    SHA-256(submitted password) with SHA-256(secret) and stores only the
 *    HASH in an httpOnly cookie;
 *  - `proxy.ts` admits an admin request only when the cookie equals the
 *    current secret's hash — changing the secret instantly invalidates
 *    old cookies (the hash no longer matches);
 *  - FAIL-CLOSED: when the env var is missing/empty, nothing admin-side is
 *    reachable (the gate page explains the configuration problem).
 *
 * No Prisma, no React, no Next runtime APIs — importable from both the edge
 * proxy and node server actions, and unit-testable in the plain `node`
 * Vitest environment.
 */

/** The httpOnly cookie carrying the secret's hash (never the secret). */
export const ADMIN_ACCESS_COOKIE = "admin_access";

/** Where the operator unlocks the gate (always reachable by the proxy). */
export const ADMIN_ACCESS_PATH = "/admin/access";

/** Where the gate sends the operator after a successful unlock. */
export const ADMIN_HOME_PATH = "/admin/perfumes";

/** SHA-256 hex digest — identical input, identical output (deterministic). */
export async function hashAdminSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The gate is configured only when the env var is a non-empty string. */
export function isAdminAccessConfigured(
  raw: string | undefined | null,
): raw is string {
  return typeof raw === "string" && raw.trim() !== "";
}

/**
 * The gate decision for one request: configured AND the cookie value equals
 * the current secret's hash. Fail-closed on any doubt (missing env, missing
 * cookie, type drift).
 */
export async function isAdminRequestAuthorized(
  cookieValue: unknown,
  secret: string | undefined | null,
): Promise<boolean> {
  if (!isAdminAccessConfigured(secret)) {
    return false;
  }
  if (typeof cookieValue !== "string" || cookieValue === "") {
    return false;
  }
  const expected = await hashAdminSecret(secret as string);
  if (typeof cookieValue !== "string" || cookieValue.length !== expected.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= cookieValue.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

/** The expected cookie value for the configured secret (its hash). */
export async function adminAccessCookieValue(secret: string): Promise<string> {
  return hashAdminSecret(secret);
}

/** Cookie options for the unlock write (httpOnly; secure outside localhost). */
export function adminAccessCookieOptions(requestHost?: string): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/admin";
  maxAge: number;
} {
  const host = requestHost ?? "";
  const isLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: !isLocal,
    path: "/admin",
    // One week of operator convenience; changing the secret invalidates it.
    maxAge: 7 * 24 * 60 * 60,
  };
}

/**
 * Only admin-relative paths may be used as a post-unlock redirect target
 * (open-redirect guard): absolute URLs, protocol-relative URLs and
 * backslash tricks are rejected.
 */
export function safeAdminRedirectPath(
  value: string | undefined | null,
): string {
  if (typeof value !== "string") {
    return ADMIN_HOME_PATH;
  }
  if (!value.startsWith("/admin") || value.startsWith("//") || value.includes("\\")) {
    return ADMIN_HOME_PATH;
  }
  return value;
}
