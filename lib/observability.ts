export interface RequestContext {
  requestId: string;
  startedAt: number;
  elapsedMs(): number;
}

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Validates a caller-supplied correlation ID; control characters are rejected. */
export function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID.test(value);
}

export function getRequestId(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  if (isValidRequestId(supplied)) return supplied;
  try {
    return crypto.randomUUID();
  } catch {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function createRequestContext(request: Request): RequestContext {
  const requestId = getRequestId(request);
  const startedAt = performance.now();
  return { requestId, startedAt, elapsedMs: () => Math.max(0, Math.round(performance.now() - startedAt)) };
}

export function withRequestId(headers: HeadersInit, requestId: string): Headers {
  const result = new Headers(headers);
  result.set("X-Request-ID", requestId);
  return result;
}
