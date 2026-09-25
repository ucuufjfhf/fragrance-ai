import { getPrisma } from "@/lib/db";
import { isValidStoreId, type WidgetConfigResult } from "@/lib/widget/contract";
import { widgetCorsHeaders } from "@/lib/widget/cors";

/**
 * GET /api/widget/config?storeId=… — public widget store validation (Phase 8).
 *
 * Smallest possible server-side store context check: the id format is
 * validated, then the store must exist AND be active. The response exposes
 * only customer-safe fields (store name + id) — no admin data, no other
 * stores, no database internals.
 *
 * CORS: widget endpoints are consumed cross-origin by merchant sites, so a
 * **reflected-origin** policy is used — `Access-Control-Allow-Origin` echoes
 * the requesting origin (never `*` with credentials; no credentials are
 * involved at all). Data here is customer-safe, and server-side store
 * validation remains the real security boundary.
 */

export async function GET(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const headers = widgetCorsHeaders(origin);

  const storeId = new URL(request.url).searchParams.get("storeId");

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
      select: { name: true },
    });

    if (!store) {
      return Response.json(
        { ok: false, reason: "STORE_NOT_FOUND" } satisfies WidgetConfigResult,
        { status: 404, headers },
      );
    }

    return Response.json(
      {
        ok: true,
        config: { storeId, storeName: store.name, active: true },
      } satisfies WidgetConfigResult & { ok: true },
      { status: 200, headers },
    );
  } catch {
    // Never leak Prisma internals to a public endpoint.
    return Response.json(
      { ok: false, reason: "STORE_NOT_FOUND" } satisfies WidgetConfigResult,
      { status: 500, headers },
    );
  }
}

export function OPTIONS(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: widgetCorsHeaders(request.headers.get("origin")),
  });
}
