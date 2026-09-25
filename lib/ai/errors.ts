/**
 * AI error types.
 *
 * Deliberately dependency-free (leaf module): `provider.ts`, `qwen.ts` and the
 * domain modules all need these classes, and importing them from `provider.ts`
 * would create a runtime import cycle (provider → qwen → domain → provider),
 * which broke module initialisation once already.
 *
 * Phase 12.4: `AiRequestError` gained STRUCTURED metadata (`status`, `timeout`,
 * `retryAfterMs`) so orchestrators (e.g. the bulk processor) can classify
 * failures reliably from properties instead of parsing `error.message`.
 * The message stays human-readable; the properties are the contract.
 */
export class AiUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AiUnavailableError";
  }
}

export interface AiRequestMetadata {
  /** HTTP status from the failing response; `null` for transport failures/timeouts. */
  status?: number | null;
  /** True when the request timed out (aborted before any response). */
  timeout?: boolean;
  /** Parsed `Retry-After` hint in milliseconds when the response carried one. */
  retryAfterMs?: number | null;
}

export class AiRequestError extends Error {
  /** HTTP status of the failing response; `null` when the request never completed. */
  readonly status: number | null;
  /** True when the request was aborted (timeout) before any response arrived. */
  readonly timeout: boolean;
  /** Parsed `Retry-After` hint (ms) from the failing response; `null` when absent. */
  readonly retryAfterMs: number | null;

  constructor(message: string, metadata: AiRequestMetadata = {}) {
    super(message);
    this.name = "AiRequestError";
    this.status = metadata.status ?? null;
    this.timeout = metadata.timeout ?? false;
    this.retryAfterMs = metadata.retryAfterMs ?? null;
  }
}

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResponseError";
  }
}
