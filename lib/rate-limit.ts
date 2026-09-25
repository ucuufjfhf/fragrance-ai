export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Process-local fixed-window limiter for the current Netlify/Next serverless
 * architecture. It deliberately has no external dependency. A global symbol
 * keeps buckets warm-instance-local across development reloads and avoids
 * cross-request state on a module-local array.
 *
 * The key may combine endpoint, store and requester dimensions. This means one
 * caller cannot consume another store's quota, while an attacker rotating
 * requester identities cannot bypass the per-store dimension.
 *
 * Limiter failures are fail-open: the protected application path remains
 * available if bookkeeping unexpectedly fails. The helper never logs inputs.
 */
const BUCKETS = Symbol.for("fiage.rate-limit.buckets.v1");
const MAX_BUCKETS = 10_000;
type GlobalWithBuckets = typeof globalThis & { [BUCKETS]?: Map<string, RateLimitEntry> };

function buckets(): Map<string, RateLimitEntry> {
  const target = globalThis as GlobalWithBuckets;
  target[BUCKETS] ??= new Map<string, RateLimitEntry>();
  return target[BUCKETS];
}

function pruneExpired(now: number): void {
  const current = buckets();
  for (const [key, entry] of current) {
    if (entry.resetAt <= now) current.delete(key);
  }
}

/** Test/operator-process seam; does not affect production behavior. */
export function resetRateLimitsForTests(): void {
  buckets().clear();
}

/** Clear one key after a successful authentication, without exposing counters. */
export function clearRateLimit(key: string): void {
  try {
    buckets().delete(key);
  } catch {
    // Best-effort only; successful auth must not depend on bookkeeping.
  }
}

export function checkRateLimit(
  key: string,
  policy: RateLimitPolicy,
  nowMs: number = Date.now(),
): RateLimitResult {
  try {
    if (!Number.isFinite(nowMs)) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (policy.limit < 1 || policy.windowMs < 1) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const current = buckets();
    pruneExpired(nowMs);
    if (current.size >= MAX_BUCKETS) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const existing = current.get(key);
    if (!existing || existing.resetAt <= nowMs) {
      current.set(key, { count: 1, resetAt: nowMs + policy.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (existing.count >= policy.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
      };
    }

    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/**
 * Best-effort requester identity from headers supplied by the hosting proxy.
 * The first x-forwarded-for hop is bounded before use as a map key. No header
 * or body is logged or persisted.
 */
export function requesterIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const direct = request.headers.get("x-real-ip")?.trim();
  const value = (forwarded || direct || "unknown").slice(0, 128);
  return /^[a-zA-Z0-9._:[\]-]+$/.test(value) ? value.toLowerCase() : "unknown";
}

export function rateLimitResponse(
  retryAfterSeconds: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status: 429,
    headers: {
      ...extraHeaders,
      "Retry-After": String(Math.max(1, retryAfterSeconds)),
    },
  });
}

export const PUBLIC_RATE_LIMITS = {
  widgetStore: { limit: 30, windowMs: 60_000 },
  widgetRequester: { limit: 10, windowMs: 60_000 },
  eventsRequester: { limit: 120, windowMs: 60_000 },
  quizRequester: { limit: 30, windowMs: 60_000 },
  adminUnlock: { limit: 5, windowMs: 15 * 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

export const ADMIN_UNLOCK_REDIRECT_ERROR = "rate_limited" as const;
