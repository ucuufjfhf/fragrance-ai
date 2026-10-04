import { AiUnavailableError } from "@/lib/ai/errors";
import { createQwenProvider } from "@/lib/ai/qwen";
import { DESCRIPTOR_DIMENSIONS } from "@/lib/fragrance/profile";
import type { FragranceDimension } from "@/types/fragrance";
import type { PersonalityVector } from "@/types/personality";
import type { MatchedPerfume } from "@/types/recommendation";

export {
  AiRequestError,
  AiResponseError,
  AiUnavailableError,
} from "@/lib/ai/errors";

/**
 * Provider-agnostic AI contract (Phase 4).
 *
 * The application depends on this module — never on a vendor SDK. Vendor code
 * lives only in `lib/ai/qwen.ts`; swapping providers (e.g. DeepSeek later) means
 * adding one file plus a branch in `createAIProvider`, with zero changes to the
 * deterministic engine or to anything else in the app.
 *
 * Non-negotiable boundaries enforced here and by the validators:
 *  - the AI never receives or returns match scores, ranks or product lists;
 *  - the nine stored profile axes (`PROFILE_AXES`) are read-only context and an
 *    AI response that tries to set them is rejected outright;
 *  - every AI call is optional: when it fails, the deterministic result stands.
 *
 * Credentials are read from the server environment only, never echoed to logs,
 * and never exposed to client components.
 */

/** Fallback timeout when `QWEN_TIMEOUT_MS` is missing or invalid. */
export const DEFAULT_AI_TIMEOUT_MS = 15_000;
/** Default OpenAI-compatible base URL — Qwen 3.6 is hosted by the GapGPT API. */
export const DEFAULT_AI_BASE_URL = "https://api.gapgpt.app/v1";
/** Default model id GapGPT exposes for Qwen 3.6. */
export const DEFAULT_AI_MODEL = "gapgpt-qwen-3.6";
export const DEFAULT_AI_PROVIDER = "qwen";

/** Descriptor dimensions the AI may fill in (never the 9 matching axes). */
export const AI_WRITABLE_DIMENSIONS: readonly FragranceDimension[] =
  DESCRIPTOR_DIMENSIONS;

export interface AiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

/** Discriminated outcome so callers degrade gracefully without try/catch noise. */
export type AiOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export interface AiPerfumeFacts {
  perfumeId: string;
  name: string;
  brand: string;
  description?: string | null;
  family?: string | null;
  /** Nullable like the other optional facts; the prompt renders `(نامشخص)`. */
  notes?: string[] | null;
}

export interface AiPerfumeProfileInput extends AiPerfumeFacts {
  /**
   * The deterministic nine-axis profile. Context only — a response that includes
   * any of these axes is rejected (see `perfume-profile.ts`).
   */
  matchingProfile: PersonalityVector;
  /** Existing descriptor values, when the profile already has some. */
  descriptors?: Partial<Record<FragranceDimension, number | null>>;
}

export interface AiPerfumeProfileResult {
  perfumeId: string;
  /** Only dimensions from `AI_WRITABLE_DIMENSIONS`, clamped to 0–100. */
  descriptors: Partial<Record<FragranceDimension, number>>;
  family?: string;
  notes?: string[];
}

export interface AiExplanationInput {
  /** Ranked deterministic recommendation. Score/rank are never sent to the AI. */
  recommendation: MatchedPerfume;
  /** Persian archetype label from Phase 1, e.g. «کاشف مرموز». */
  archetypeLabel: string;
  perfume: AiPerfumeFacts;
  /** Persian-labelled user traits (already normalised 0–100). */
  traits: Array<{ label: string; value: number }>;
}

export interface AiExplanationResult {
  perfumeId: string;
  /** Short Persian «چرا این عطر؟» text. */
  explanation: string;
}

export interface AIProvider {
  readonly id: string;
  /** True when the provider has everything it needs to make a call. */
  isAvailable(): boolean;
  /** Human-readable reason when unavailable; `null` when available. */
  unavailableReason(): string | null;
  generatePerfumeProfile(
    input: AiPerfumeProfileInput,
  ): Promise<AiPerfumeProfileResult>;
  generateRecommendationExplanation(
    input: AiExplanationInput,
  ): Promise<AiExplanationResult>;
}

/* -------------------------------------------------------------- config read */

function readTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_AI_TIMEOUT_MS;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_AI_TIMEOUT_MS;
  }

  return Math.floor(value);
}

/**
 * Reads AI configuration from the server environment.
 *
 * Missing credentials are reported through an unavailable provider instead of
 * throwing, so importing or calling this module can never break the app.
 */
export function readAiConfig(
  env: Record<string, string | undefined> = process.env,
): AiConfig {
  return {
    provider: (env.AI_PROVIDER ?? DEFAULT_AI_PROVIDER).trim().toLowerCase(),
    apiKey: (env.QWEN_API_KEY ?? "").trim(),
    baseUrl: (env.QWEN_BASE_URL ?? "").trim() || DEFAULT_AI_BASE_URL,
    model: (env.QWEN_MODEL ?? DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL,
    timeoutMs: readTimeout(env.QWEN_TIMEOUT_MS),
  };
}

/* ------------------------------------------------------------ null provider */

/**
 * Null-object provider used whenever AI is disabled or misconfigured.
 *
 * Every call throws `AiUnavailableError`; the domain helpers catch it and return
 * `{ ok: false }`, so a missing key can never break a recommendation request.
 */
export function createUnavailableProvider(reason: string): AIProvider {
  return {
    id: "unavailable",
    isAvailable: () => false,
    unavailableReason: () => reason,
    generatePerfumeProfile: async () => {
      throw new AiUnavailableError(reason);
    },
    generateRecommendationExplanation: async () => {
      throw new AiUnavailableError(reason);
    },
  };
}

/**
 * Returns the configured provider, or the null object when AI is disabled or the
 * credentials for the selected provider are missing.
 */
export function createAIProvider(config: AiConfig = readAiConfig()): AIProvider {
  if (config.provider === "" || config.provider === "none") {
    return createUnavailableProvider("AI is disabled (AI_PROVIDER=none).");
  }

  if (config.provider !== "qwen") {
    return createUnavailableProvider(
      `unsupported AI provider "${config.provider}".`,
    );
  }

  const missing = [
    config.apiKey === "" ? "QWEN_API_KEY" : null,
    config.baseUrl === "" ? "QWEN_BASE_URL" : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    return createUnavailableProvider(
      `AI provider "qwen" is not configured: ${missing.join(", ")} missing.`,
    );
  }

  return createQwenProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
  });
}
