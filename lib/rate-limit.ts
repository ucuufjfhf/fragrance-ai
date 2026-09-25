import { getPrisma } from "@/lib/db";
import { logEvent } from "@/lib/observability/logger";
export interface RateLimitPolicy { readonly limit: number; readonly windowMs: number; }
export interface RateLimitResult { readonly allowed: boolean; readonly retryAfterSeconds: number; }
export async function checkRateLimit(key: string, policy: RateLimitPolicy, nowMs = Date.now()): Promise<RateLimitResult> {
  if (!Number.isFinite(nowMs) || policy.limit < 1 || policy.windowMs < 1) return { allowed: true, retryAfterSeconds: 0 };
  const windowStart = new Date(Math.floor(nowMs / policy.windowMs) * policy.windowMs);
  try {
    const rows = await getPrisma().$queryRaw<Array<{ count: number }>>`INSERT INTO "RateLimitCounter" ("id", "key", "windowStart", "count", "updatedAt") VALUES (md5(random()::text || clock_timestamp()::text), ${key}, ${windowStart}, 1, NOW()) ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitCounter"."count" + 1, "updatedAt" = NOW() RETURNING "count"`;
    const count = Number(rows[0]?.count ?? 1);
    if (count > policy.limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + policy.windowMs - nowMs) / 1000)) };
    if (Math.random() < 0.01) await getPrisma().rateLimitCounter.deleteMany({ where: { windowStart: { lt: new Date(nowMs - Math.max(policy.windowMs * 2, 3_600_000)) } } });
    return { allowed: true, retryAfterSeconds: 0 };
  } catch { logEvent("rate_limit_db_failure", { errorType: "database_error" }, "error"); return { allowed: true, retryAfterSeconds: 0 }; }
}
export async function clearRateLimit(key: string): Promise<void> { try { await getPrisma().rateLimitCounter.deleteMany({ where: { key } }); } catch { logEvent("rate_limit_db_failure", { errorType: "database_error" }, "error"); } }
export function resetRateLimitsForTests(): void { /* shared database state */ }
export function requesterIdentity(request: Request): string { const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim(); const direct = request.headers.get("x-real-ip")?.trim(); const value = (forwarded || direct || "unknown").slice(0, 128); return /^[a-zA-Z0-9._:[\]-]+$/.test(value) ? value.toLowerCase() : "unknown"; }
export function rateLimitResponse(retryAfterSeconds: number, body: unknown, extraHeaders: Record<string, string> = {}): Response { return Response.json(body, { status: 429, headers: { ...extraHeaders, "Retry-After": String(Math.max(1, retryAfterSeconds)) } }); }
export const PUBLIC_RATE_LIMITS = { widgetStore: { limit: 30, windowMs: 60_000 }, widgetRequester: { limit: 10, windowMs: 60_000 }, eventsRequester: { limit: 120, windowMs: 60_000 }, quizRequester: { limit: 30, windowMs: 60_000 }, adminUnlock: { limit: 5, windowMs: 900_000 } } as const satisfies Record<string, RateLimitPolicy>;
export const ADMIN_UNLOCK_REDIRECT_ERROR = "rate_limited" as const;
