import { getPrisma } from "@/lib/db";
import { normalizeAccentColor } from "@/lib/store/branding";
import { isValidStoreId, type WidgetConfigResult } from "@/lib/widget/contract";
import { widgetCorsHeaders } from "@/lib/widget/cors";
import {
  PUBLIC_RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
  requesterIdentity,
} from "@/lib/rate-limit";

/**
 * GET /api/widget/config?storeId=… — public widget store validation (Phase 8).
 *
 * Smallest possible server-side store context check: the id format is
 * validated, then the store must exist AND be active. The response exposes
 * only customer-safe fields (store id, name, public slug, logo, own site,
 * brand colour) — no admin data, no other stores, no database internals. The logo is the store's own public
 * branding, which the merchant already shows on the site the widget is
 * embedded into.
 *
 * CORS: widget endpoints are consumed cross-origin by merchant sites, so a
 * **reflected-origin** policy is used — `Access-Control-Allow-Origin` echoes
 * the requesting origin (never `*` with credentials; no credentials are
 * involved at all). Data here is customer-safe, and server-side store
 * validation remains the real security boundary.
 *
 * Rate limit: one per requester, BEFORE the store lookup — this endpoint used
 * to be the only public one that could be turned into unbounded Prisma reads.
 * 60/min is ~6× the widget's own 10/min recommend cap and a real embed fetches
 * config once, so it costs genuine merchants nothing.
 */

export async function GET(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const storeId = new URL(request.url).searchParams.get("storeId");
  const headers = widgetCorsHeaders(origin, null);

  // The brake goes first so an over-limit caller never reaches the database.
  // The 429 therefore carries the same pre-lookup CORS headers as this route's
  // 400 (no `Access-Control-Allow-Origin`, because the store — and so the
  // allowed origin — is not resolved yet), plus Retry-After via the shared
  // helper, exactly like the recommend route's 429 shape.
  const limit = await checkRateLimit(
    `config:requester:${requesterIdentity(request)}`,
    PUBLIC_RATE_LIMITS.configRequester,
  );
  if (!limit.allowed) {
    return rateLimitResponse(
      limit.retryAfterSeconds,
      { ok: false, reason: "RATE_LIMITED" },
      headers,
    );
  }

  if (!isValidStoreId(storeId)) {
    return Response.json(
      { ok: false, reason: "INVALID_ID" } satisfies WidgetConfigResult,
      { status: 400, headers },
    );
  }

  const prisma = getPrisma();

  try {
    const store = await prisma.store.findFirst({
      where: { id: storeId, active: true },
      select: { name: true, slug: true, websiteUrl: true, logoUrl: true, accentColor: true },
    });
    const storeHeaders = widgetCorsHeaders(origin, store?.websiteUrl);

    if (!store) {
      return Response.json(
        { ok: false, reason: "STORE_NOT_FOUND" } satisfies WidgetConfigResult,
        { status: 404, headers: storeHeaders },
      );
    }

    return Response.json(
      {
        ok: true,
        config: {
          storeId,
          storeName: store.name,
          logoUrl: store.logoUrl,
          // The readable campaign identifier (utm_campaign). Public by design:
          // it is the store's own name in its own URL.
          slug: store.slug,
          // The merchant's own public site — the fallback CTA destination when
          // a recommendation has no product page. Already selected for CORS.
          websiteUrl: store.websiteUrl,
          // Brand colour for the widget shell; null (or a column that somehow
          // holds a non-`#rrggbb` value) means the FIAGE default accent.
          accentColor: normalizeAccentColor(store.accentColor),
          active: true,
        },
      } satisfies WidgetConfigResult & { ok: true },
      { status: 200, headers: storeHeaders },
    );
  } catch {
    // Never leak Prisma internals to a public endpoint.
    return Response.json(
      { ok: false, reason: "STORE_NOT_FOUND" } satisfies WidgetConfigResult,
      { status: 500, headers },
    );
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const storeId = new URL(request.url).searchParams.get("storeId");
  const origin = request.headers.get("origin");
  const prisma = getPrisma();
  const store = storeId && isValidStoreId(storeId)
    ? await prisma.store.findFirst({ where: { id: storeId, active: true }, select: { websiteUrl: true } })
    : null;
  return new Response(null, { status: 204, headers: widgetCorsHeaders(origin, store?.websiteUrl) });
}
