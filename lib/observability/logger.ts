import type { RequestContext } from "@/lib/observability";

export type LogLevel = "info" | "warn" | "error";
export type LogFields = {
  requestId?: string;
  storeId?: string;
  durationMs?: number;
  errorType?: string;
  circuit?: string;
  status?: string;
};

export function classifyError(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unknown_error";
  const candidate = error as { name?: unknown; status?: unknown; timeout?: unknown; constructor?: { name?: unknown } };
  if (candidate.timeout === true || candidate.name === "AbortError") return "provider_timeout";
  if (typeof candidate.status === "number" && candidate.status >= 500) return "provider_5xx";
  if (candidate.name === "AiResponseError") return "provider_invalid_response";
  if (candidate.name === "AiUnavailableError") return "ai_unavailable";
  if (candidate.name === "PrismaClientKnownRequestError") return "database_error";
  if (candidate.name === "Error" || candidate.name) return "operation_error";
  return "unknown_error";
}

export function logEvent(event: string, fields: LogFields = {}, level: LogLevel = "info"): void {
  try {
    const payload = { timestamp: new Date().toISOString(), level, event, ...fields };
    console.info(JSON.stringify(payload));
  } catch {
    // Observability must never affect request execution.
  }
}

export function logRequestFailure(context: RequestContext, event: string, error: unknown, storeId?: string): void {
  logEvent(event, { requestId: context.requestId, storeId, durationMs: context.elapsedMs(), errorType: classifyError(error) }, "error");
}
