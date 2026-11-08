/**
 * Pure helpers for the minimal admin access gate (pre-deployment hardening).
 *
 * MVP threat model: the admin surface manages merchant inventory and reads
 * analytics, so on any deployment outside localhost it must not be publicly
 * reachable. This is a shared-secret GATE, not an authentication system —
 * no accounts, no roles, no sessions beyond a short-lived signed cookie.
 *
 * Mechanics:
 *  - the operator configures `ADMIN_ACCESS_SECRET` (server-side env only), at
 *    least `ADMIN_SECRET_MIN_LENGTH` characters long;
 *  - the browser never receives the secret. The unlock action compares the
 *    submitted password's SHA-256 with the secret's SHA-256 in constant time
 *    and then mints a signed, expiring token:
 *    `v1.<expiresAtSeconds>.<hmacHex>`, where the HMAC is HMAC-SHA-256 keyed
 *    with the secret over `fiage-admin-access:v1:<expiresAtSeconds>`;
 *  - the TOKEN, not the secret or its hash, is what the httpOnly cookie
 *    carries. A bare `SHA-256(secret)` cookie authorizes nothing, so a leaked
 *    cookie is not password-equivalent and a leaked hash is not a credential
 *    that can be replayed;
 *  - every admin page guards itself through `requireAdmin()` and every admin
 *    SERVER ACTION through `requireAdminAction()` in
 *    `lib/admin/server-access.ts` — the old `proxy.ts` network boundary is
 *    gone, so there is no middleware to rely on. Rotating the secret
 *    invalidates every outstanding token instantly: the HMAC no longer
 *    verifies;
 *  - FAIL-CLOSED: when the env var is missing, empty or shorter than the
 *    floor, nothing admin-side is reachable (the gate page explains the
 *    configuration problem).
 *
 * No Prisma, no React, no Next runtime APIs, no dependencies — WebCrypto
 * (`crypto.subtle`) only. Importable from both edge and node server actions,
 * and unit-testable in the plain `node` Vitest environment.
 */

/** The httpOnly cookie carrying the signed access token (never the secret). */
export const ADMIN_ACCESS_COOKIE = "admin_access";

/** Where the operator unlocks the gate (always reachable by the proxy). */
export const ADMIN_ACCESS_PATH = "/admin/access";

/** Where the gate sends the operator after a successful unlock. */
export const ADMIN_HOME_PATH = "/admin/perfumes";

/** Token lifetime: one week — the same window the cookie's `maxAge` uses. */
export const ADMIN_ACCESS_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Minimum secret length. A shorter secret is treated exactly like a missing
 * one (fail-closed, "not configured"), because a fast unsalted hash over a
 * guessable password is offline-brute-forceable.
 */
export const ADMIN_SECRET_MIN_LENGTH = 20;

/** Token version tag; a future scheme must change this, not reuse it. */
const TOKEN_TAG = "v1";

/** Domain separation, so the HMAC can never be confused with another use. */
const TOKEN_DOMAIN = "fiage-admin-access";

/** SHA-256 hex digest — identical input, identical output (deterministic). */
export async function hashAdminSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string equality (only the length is allowed to leak).
 *
 * Every credential comparison goes through here — the token HMAC check below
 * and the unlock action's submitted-vs-expected hash check — so no comparison
 * can be walked byte by byte to learn a prefix.
 */
export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * The gate is configured only when the env var is a string whose trimmed
 * length clears `ADMIN_SECRET_MIN_LENGTH`.
 */
export function isAdminAccessConfigured(
  raw: string | undefined | null,
): raw is string {
  return (
    typeof raw === "string" && raw.trim().length >= ADMIN_SECRET_MIN_LENGTH
  );
}

/** HMAC-SHA-256 over the domain-separated expiry, hex-encoded. */
async function signAdminToken(
  secret: string,
  expiresAtSeconds: number,
): Promise<string> {
  const message = `${TOKEN_DOMAIN}:${TOKEN_TAG}:${expiresAtSeconds}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Mints the value the httpOnly cookie carries: `v1.<expiresAt>.<hmacHex>`,
 * with `expiresAt` = issue time + `ADMIN_ACCESS_TOKEN_TTL_SECONDS`.
 *
 * Deterministic for a given (secret, issue second) — that statelessness is what
 * lets the verifier recompute the signature — and `nowMs` is injectable so
 * tests can mint and verify against a fixed clock.
 */
export async function mintAdminAccessToken(
  secret: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const expiresAtSeconds =
    Math.floor(nowMs / 1000) + ADMIN_ACCESS_TOKEN_TTL_SECONDS;
  const signature = await signAdminToken(secret, expiresAtSeconds);
  return `${TOKEN_TAG}.${expiresAtSeconds}.${signature}`;
}

/**
 * The gate decision for one request: configured AND the cookie value is a
 * well-formed, correctly signed, unexpired v1 token. Fail-closed on any doubt
 * (missing/short env, missing cookie, wrong shape, bad tag, bad expiry,
 * signature mismatch); `nowMs` is injectable for expiry tests.
 */
export async function isAdminRequestAuthorized(
  cookieValue: unknown,
  secret: string | undefined | null,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!isAdminAccessConfigured(secret)) {
    return false;
  }
  if (typeof cookieValue !== "string" || cookieValue === "") {
    return false;
  }

  const parts = cookieValue.split(".");
  if (parts.length !== 3) {
    return false;
  }
  const [tag, expiresRaw, signature] = parts as [string, string, string];
  if (tag !== TOKEN_TAG) {
    return false;
  }
  // Digits only, canonical (no leading zeros), and a sane magnitude.
  if (!/^[1-9][0-9]{0,11}$/.test(expiresRaw)) {
    return false;
  }
  const expiresAtSeconds = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAtSeconds)) {
    return false;
  }
  if (expiresAtSeconds <= Math.floor(nowMs / 1000)) {
    return false;
  }

  const expected = await signAdminToken(secret, expiresAtSeconds);
  return constantTimeEqual(signature, expected);
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
    // One source for the token's lifetime and the cookie's: the token expires
    // no later than the cookie, so a stale token is never resurrected by it.
    maxAge: ADMIN_ACCESS_TOKEN_TTL_SECONDS,
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
