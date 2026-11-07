import { recordAnalyticsEvent } from "@/lib/analytics/service";
import { validateAnalyticsEvent } from "@/lib/analytics/types";
import {
  PUBLIC_RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
  requesterIdentity,
} from "@/lib/rate-limit";

/**
 * POST /api/events — the anonymous analytics write endpoint (Phase 7).
 *
 * Defensive by design (§11): the browser sends only `{ eventType, storeId?,
 * sessionId?, perfumeId?, metadata? }`. The server re-validates everything —
 * shape via the pure contract, relationships (active store, perfume ∈ store)
 * via Prisma. Unknown event types, malformed ids, foreign-store perfumes and
 * oversized metadata are rejected without touching the database.
 *
 * Responses never expose internals: 202 on success, 400 for a rejected
 * payload, 404 for an unknown store/perfume, 405 for anything but POST. No
 * stack traces, no Prisma errors, no DATABASE_URL.
 *
 * This endpoint remains anonymous and approximate; a requester-scoped limiter
 * prevents unlimited submission without introducing tracking, and a
 * store-scoped limiter stops one source from dominating a single merchant's
 * numbers even when it rotates requester identities.
 */

export async function POST(request: Request): Promise<Response> {
  const limit = await checkRateLimit(
    `events:requester:${requesterIdentity(request)}`,
    PUBLIC_RATE_LIMITS.eventsRequester,
  );
  if (!limit.allowed) {
    return rateLimitResponse(
      limit.retryAfterSeconds,
      { ok: false, error: "RATE_LIMITED" },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  // Shape first, before any store-scoped counter exists to spend.
  //
  // The pure validator is the same one the writer runs, so a payload rejected
  // here would have been rejected there anyway — only the price changes. A
  // garbage body carrying a well-formed storeId used to burn that merchant's
  // 600/min budget on its way to a 400; now it is rejected before the store is
  // even named, and never reaches the writer. The response is byte-for-byte the
  // one the writer's INVALID_EVENT mapping produced.
  const validation = validateAnalyticsEvent(payload);

  if (!validation.ok) {
    return Response.json({ ok: false, error: "INVALID_EVENT" }, { status: 400 });
  }

  // Store-scoped line of defence.
  //
  // A storeId is public — it is printed in the embed snippet — so a requester
  // cap alone leaves a merchant's numbers writable by one source rotating
  // identities. 600/min is ~5× a single requester's 120/min and far above real
  // traffic (~6 events per quiz session), so it only bites on abuse. Storeless
  // events (the main quiz before any store is chosen) have nothing to scope to
  // and keep the requester check alone.
  const storeId = validation.value.storeId;

  if (typeof storeId === "string") {
    const storeLimit = await checkRateLimit(
      `events:store:${storeId}`,
      PUBLIC_RATE_LIMITS.eventsStore,
    );

    if (!storeLimit.allowed) {
      return rateLimitResponse(
        storeLimit.retryAfterSeconds,
        { ok: false, error: "RATE_LIMITED" },
      );
    }
  }

  const result = await recordAnalyticsEvent(payload);

  if (result.ok) {
    return Response.json({ ok: true }, { status: 202 });
  }

  if (result.reason === "STORE_NOT_FOUND" || result.reason === "PERFUME_NOT_IN_STORE") {
    return Response.json({ ok: false, error: result.reason }, { status: 404 });
  }

  return Response.json({ ok: false, error: "INVALID_EVENT" }, { status: 400 });
}

export function GET(): Response {
  return Response.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}
