import { getPrisma } from "@/lib/db";
import { logEvent } from "@/lib/observability/logger";
export interface RateLimitPolicy { readonly limit: number; readonly windowMs: number; }
export interface RateLimitResult { readonly allowed: boolean; readonly retryAfterSeconds: number; }
/**
 * Failure direction for the limiter.
 *
 * Default (absent) = fail OPEN: when the counter table is unreachable, allow.
 * Correct for public endpoints — analytics, widget, quiz — where a database
 * hiccup must not take the shop down for everyone.
 *
 * `failClosed: true` = deny when the limiter cannot decide. Correct where the
 * limit IS the protection (the admin unlock): being unable to count attempts
 * is a reason to refuse them, not to wave them through.
 */
export interface RateLimitOptions { readonly failClosed?: boolean; }
export async function checkRateLimit(key: string, policy: RateLimitPolicy, nowMs = Date.now(), options: RateLimitOptions = {}): Promise<RateLimitResult> {
  // A sane Retry-After even for a misconfigured policy: one full window.
  const windowSeconds = Number.isFinite(policy.windowMs) && policy.windowMs >= 1 ? Math.max(1, Math.ceil(policy.windowMs / 1000)) : 60;
  const unavailable = (): RateLimitResult => ({ allowed: false, retryAfterSeconds: windowSeconds });
  if (!Number.isFinite(nowMs) || policy.limit < 1 || policy.windowMs < 1) return options.failClosed ? unavailable() : { allowed: true, retryAfterSeconds: 0 };
  const windowStart = new Date(Math.floor(nowMs / policy.windowMs) * policy.windowMs);
  try {
    const rows = await getPrisma().$queryRaw<Array<{ count: number }>>`INSERT INTO "RateLimitCounter" ("id", "key", "windowStart", "count", "updatedAt") VALUES (md5(random()::text || clock_timestamp()::text), ${key}, ${windowStart}, 1, NOW()) ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitCounter"."count" + 1, "updatedAt" = NOW() RETURNING "count"`;
    const count = Number(rows[0]?.count ?? 1);
    if (count > policy.limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + policy.windowMs - nowMs) / 1000)) };
    if (Math.random() < 0.01) await getPrisma().rateLimitCounter.deleteMany({ where: { windowStart: { lt: new Date(nowMs - Math.max(policy.windowMs * 2, 3_600_000)) } } });
    return { allowed: true, retryAfterSeconds: 0 };
  } catch { logEvent("rate_limit_db_failure", { errorType: "database_error" }, "error"); return options.failClosed ? unavailable() : { allowed: true, retryAfterSeconds: 0 }; }
}
export async function clearRateLimit(key: string): Promise<void> { try { await getPrisma().rateLimitCounter.deleteMany({ where: { key } }); } catch { logEvent("rate_limit_db_failure", { errorType: "database_error" }, "error"); } }
export function resetRateLimitsForTests(): void { /* shared database state */ }
/** Trims, bounds and validates one candidate header value; null when unusable. */
function sanitizeIdentity(raw: string | null | undefined): string | null {
  const value = raw?.trim().slice(0, 128);
  if (!value) return null;
  return /^[a-zA-Z0-9._:[\]-]+$/.test(value) ? value.toLowerCase() : null;
}

/**
 * The requester's identity for a rate-limit key.
 *
 * Precedence — strongest first:
 *  1. `x-nf-client-connection-ip`: Netlify's edge sets this from the actual TCP
 *     peer, so a client cannot choose it through the proxy (it can only send a
 *     value that the edge overwrites).
 *  2. the LAST `x-forwarded-for` entry: each proxy appends the hop it saw, so
 *     the rightmost entry is the one added by the nearest proxy. The FIRST
 *     entry is whatever the client sent — rotating it used to reset every
 *     requester-scoped limit (events, widget, quiz, admin unlock).
 *  3. `x-real-ip`: single-value fallback for proxies that set it.
 *  4. `"unknown"` — a shared bucket, so unidentifiable callers are limited
 *     collectively rather than not at all.
 *
 * Each candidate is validated rather than trusted: a malformed value falls
 * through to the next source instead of becoming an arbitrary key.
 */
export function requesterIdentity(request: Request): string {
  const netlifyClientIp = request.headers.get("x-nf-client-connection-ip");
  const forwardedHops = request.headers.get("x-forwarded-for")?.split(",");
  const nearestForwarded = forwardedHops?.[forwardedHops.length - 1];
  const realIp = request.headers.get("x-real-ip");

  return sanitizeIdentity(netlifyClientIp) ?? sanitizeIdentity(nearestForwarded) ?? sanitizeIdentity(realIp) ?? "unknown";
}
export function rateLimitResponse(retryAfterSeconds: number, body: unknown, extraHeaders: Record<string, string> = {}): Response { return Response.json(body, { status: 429, headers: { ...extraHeaders, "Retry-After": String(Math.max(1, retryAfterSeconds)) } }); }
export const PUBLIC_RATE_LIMITS = { widgetStore: { limit: 30, windowMs: 60_000 }, widgetRequester: { limit: 10, windowMs: 60_000 }, eventsRequester: { limit: 120, windowMs: 60_000 }, quizRequester: { limit: 30, windowMs: 60_000 }, adminUnlock: { limit: 5, windowMs: 900_000 } } as const satisfies Record<string, RateLimitPolicy>;
export const ADMIN_UNLOCK_REDIRECT_ERROR = "rate_limited" as const;
