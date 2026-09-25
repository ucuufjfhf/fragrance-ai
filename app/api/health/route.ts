import { getPrisma } from "@/lib/db";
import { createAIProvider } from "@/lib/ai/provider";
import { getAiControlState } from "@/lib/ai/cost-controls";
import { createRequestContext, withRequestId } from "@/lib/observability";
import { logEvent } from "@/lib/observability/logger";

const DB_TIMEOUT_MS = 1_500;

export async function GET(request: Request): Promise<Response> {
  const context = createRequestContext(request);
  const started = performance.now();
  let database: "ok" | "down" = "ok";
  try {
    await Promise.race([
      getPrisma().$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("database_health_timeout")), DB_TIMEOUT_MS)),
    ]);
  } catch {
    database = "down";
    logEvent("database_health_failure", { requestId: context.requestId, durationMs: Math.round(performance.now() - started), errorType: "database_error" }, "error");
  }
  const provider = createAIProvider();
  const circuit = getAiControlState().circuitState;
  const ai = provider.isAvailable() ? (circuit === "OPEN" ? "circuit_open" : "available") : "not_configured";
  const status = database === "down" ? "down" : ai === "available" && circuit === "CLOSED" ? "ok" : "degraded";
  const body = { status, database, ai: { status: ai, circuit }, requestId: context.requestId, durationMs: context.elapsedMs() };
  return Response.json(body, { status: database === "down" ? 503 : 200, headers: withRequestId({}, context.requestId) });
}
