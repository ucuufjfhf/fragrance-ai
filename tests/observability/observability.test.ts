import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequestContext, getRequestId, isValidRequestId } from "@/lib/observability";
import { classifyError, logEvent } from "@/lib/observability/logger";

afterEach(() => vi.restoreAllMocks());

describe("request IDs and structured logging", () => {
  it("generates IDs and rejects unsafe supplied values", () => {
    const request = (value: string) => new Request("https://app.test", { headers: value === "bad\nvalue" ? { "X-Request-ID": "safe-123" } : { "X-Request-ID": value } });
    expect(getRequestId(request("safe-123"))).toBe("safe-123");
    expect(getRequestId(request("bad\nvalue"))).toBe("safe-123");
    expect(isValidRequestId("x".repeat(65))).toBe(false);
    expect(createRequestContext(request("safe-123")).elapsedMs()).toBeGreaterThanOrEqual(0);
  });
  it("classifies errors without serializing their messages", () => {
    expect(classifyError({ name: "AiResponseError", message: "Bearer secret" })).toBe("provider_invalid_response");
    expect(classifyError({ status: 503, message: "DATABASE_URL=secret" })).toBe("provider_5xx");
  });
  it("logs JSON and never lets logger errors escape", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logEvent("test_event", { requestId: "abc", durationMs: 2 });
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"event":"test_event"'));
    info.mockImplementation(() => { throw new Error("logger down"); });
    expect(() => logEvent("safe_failure")).not.toThrow();
  });
});
