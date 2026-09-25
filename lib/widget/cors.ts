/**
 * Shared CORS headers for the public widget endpoints (Phase 8).
 *
 * Kept OUT of the route modules: Next's generated route type-check rejects any
 * non-route export from a route file (route handlers may only export the
 * documented HTTP methods + config names), and the recommend route imports
 * this helper too.
 */

/** Permissive CORS for widget embedding: merchant pages may call these APIs. */
export function widgetCorsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
