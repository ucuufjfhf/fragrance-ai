/**
 * Shared CORS headers for the public widget endpoints (Phase 8).
 *
 * Kept OUT of the route modules: Next's generated route type-check rejects any
 * non-route export from a route file (route handlers may only export the
 * documented HTTP methods + config names), and the recommend route imports
 * this helper too.
 */

/** Returns CORS headers only for the store's configured website origin. */
export function widgetCorsHeaders(origin: string | null, websiteUrl: string | null | undefined): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (!origin || !websiteUrl) return base;
  try {
    const allowed = new URL(websiteUrl).origin;
    const requested = new URL(origin).origin;
    const isLocal = (value: string) => ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname);
    const samePort = (left: string, right: string) => {
      const a = new URL(left); const b = new URL(right);
      return (a.port || (a.protocol === "http:" ? "80" : "443")) === (b.port || (b.protocol === "http:" ? "80" : "443"));
    };
    if (requested === allowed || (isLocal(allowed) && isLocal(requested) && samePort(allowed, requested))) {
      return { ...base, "Access-Control-Allow-Origin": requested };
    }
  } catch {
    return base;
  }
  return base;
}

