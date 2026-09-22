import { recordAnalyticsEvent } from "@/lib/analytics/service";

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
 * This endpoint is intentionally anonymous and rate-limit-free — analytics is
 * approximate, not fraud-proof (documented limitation).
 */

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
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
