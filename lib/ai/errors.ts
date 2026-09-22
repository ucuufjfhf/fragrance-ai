/**
 * AI error types.
 *
 * Deliberately dependency-free (leaf module): `provider.ts`, `qwen.ts` and the
 * domain modules all need these classes, and importing them from `provider.ts`
 * would create a runtime import cycle (provider → qwen → domain → provider),
 * which broke module initialisation once already.
 */
export class AiUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AiUnavailableError";
  }
}

export class AiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRequestError";
  }
}

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResponseError";
  }
}
