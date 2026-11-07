import { getPrisma } from "@/lib/db";
import { createAIProvider } from "@/lib/ai/provider";
import { getAiControlState } from "@/lib/ai/cost-controls";
import { createRequestContext, withRequestId } from "@/lib/observability";
import { logEvent } from "@/lib/observability/logger";

/**
 * GET /api/health — a coarse liveness signal for external monitors.
 *
 * Two deliberate properties:
 *
 *  1. **Tolerant probe.** The first database probe races a 1,500 ms window.
 *     That window is tight for a cold Supabase-pooler connection: a real
 *     false alarm measured 1,516 ms while config/recommend reads on the same
 *     pool succeeded. On failure we retry ONCE with a 3,000 ms window before
 *     declaring the database down — absorbing a cold connection, while a
 *     genuinely dead database still reports down, about 4.5 s later.
 *
 *  2. **Quiet body.** The public body is exactly `{ status }`. Database state,
 *     AI provider state, circuit-breaker state, requestId and durationMs used
 *     to be disclosed; none of them helps a monitor, which needs the status
 *     code and one coarse word. The details stay server-side in the log, and
 *     correlation stays in the `X-Request-ID` response HEADER.
 *
 * HTTP semantics are unchanged: 503 only when the database is down, 200
 * otherwise. AI is optional, so its outage is `degraded`, never unhealthy.
 */

const DB_TIMEOUT_MS = 1_500;
const DB_RETRY_TIMEOUT_MS = 3_000;

/** One database probe with its own timeout; rejects on timeout or error. */
function probeDatabase(timeoutMs: number): Promise<unknown> {
  return Promise.race([
    getPrisma().$queryRaw`SELECT 1`,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("database_health_timeout")), timeoutMs),
    ),
  ]);
}

export async function GET(request: Request): Promise<Response> {
  const context = createRequestContext(request);
  const started = performance.now();
  let database: "ok" | "down" = "ok";

  try {
    await probeDatabase(DB_TIMEOUT_MS);
  } catch {
    // One retry with a wider window: a cold pooler connection can land just
    // past the first one. Only a second failure is a real outage.
    try {
      await probeDatabase(DB_RETRY_TIMEOUT_MS);
    } catch {
      database = "down";
      logEvent(
        "database_health_failure",
        {
          requestId: context.requestId,
          durationMs: Math.round(performance.now() - started),
          errorType: "database_error",
        },
        "error",
      );
    }
  }

  const provider = createAIProvider();
  const circuit = getAiControlState().circuitState;
  const ai = provider.isAvailable() ? (circuit === "OPEN" ? "circuit_open" : "available") : "not_configured";
  const status = database === "down" ? "down" : ai === "available" && circuit === "CLOSED" ? "ok" : "degraded";

  // `{ status }` and nothing else: the internals above are for the log only.
  return Response.json(
    { status },
    { status: database === "down" ? 503 : 200, headers: withRequestId({}, context.requestId) },
  );
}
