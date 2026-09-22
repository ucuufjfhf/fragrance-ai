import { AiRequestError, AiResponseError } from "@/lib/ai/errors";
import type {
  AIProvider,
  AiExplanationInput,
  AiExplanationResult,
  AiPerfumeProfileInput,
  AiPerfumeProfileResult,
} from "@/lib/ai/provider";
import {
  EXPLANATION_SYSTEM_PROMPT,
  buildExplanationUserPrompt,
  validateAiExplanation,
} from "@/lib/ai/explanation";
import {
  PROFILE_SYSTEM_PROMPT,
  buildProfileUserPrompt,
  validateAiProfileResult,
} from "@/lib/ai/perfume-profile";

/**
 * Qwen3.6 implementation of `AIProvider`, talking to the GaptGPT API
 * (OpenAI-compatible `/chat/completions`).
 *
 * This is the only file in the codebase that knows a vendor's HTTP shape. It:
 *  - keeps the API key server-side (sent as a bearer header, never logged);
 *  - enforces a hard timeout via `AbortController` (see `QWEN_TIMEOUT_MS`);
 *  - maps transport problems to `AiRequestError` / `AiResponseError` so callers
 *    can degrade instead of crashing;
 *  - delegates all response validation to the pure validators in
 *    `perfume-profile.ts` / `explanation.ts` (structured output + anti-hallucination).
 *
 * Prompts are intentionally tiny (a few hundred tokens): the dev credit is small
 * and the model only writes Persian copy — all numbers come from the engine.
 */

/** Small ceiling keeps cost predictable; the outputs are short by design. */
export const AI_MAX_OUTPUT_TOKENS = 500;

/** Low temperature: deterministic-ish wording, less creative drift. */
export const AI_TEMPERATURE = 0.2;

export interface QwenProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Test seam: inject a fake fetch instead of hitting the network. */
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

function endpointFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/** Extracts the first JSON object from a model reply, tolerating prose around it. */
function extractJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new AiResponseError("model reply did not contain a JSON object.");
    }

    try {
      return JSON.parse(content.slice(start, end + 1));
    } catch {
      throw new AiResponseError("model reply was not valid JSON.");
    }
  }
}

export function createQwenProvider(options: QwenProviderOptions): AIProvider {
  const { apiKey, baseUrl, model, timeoutMs } = options;
  const doFetch = options.fetchImpl ?? fetch;
  const url = endpointFor(baseUrl);

  async function complete(systemPrompt: string, userPrompt: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;

    try {
      response = await doFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: AI_TEMPERATURE,
          max_tokens: AI_MAX_OUTPUT_TOKENS,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : "unknown error";

      throw new AiRequestError(
        reason === "AbortError"
          ? `AI request timed out after ${timeoutMs}ms.`
          : "AI request failed before a response was received.",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // The upstream body may help debugging, but it never contains our key.
      const detail = (await response.text().catch(() => ""))
        .slice(0, 200)
        .replace(/\s+/g, " ")
        .trim();

      throw new AiRequestError(
        `AI request failed with HTTP ${response.status}${detail === "" ? "" : `: ${detail}`}`,
      );
    }

    let payload: ChatCompletionResponse;

    try {
      payload = (await response.json()) as ChatCompletionResponse;
    } catch {
      throw new AiResponseError("AI response was not valid JSON.");
    }

    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== "string" || content.trim() === "") {
      throw new AiResponseError("AI response did not contain any text content.");
    }

    return extractJsonObject(content);
  }

  return {
    id: "qwen",
    isAvailable: () => true,
    unavailableReason: () => null,

    async generatePerfumeProfile(
      input: AiPerfumeProfileInput,
    ): Promise<AiPerfumeProfileResult> {
      const raw = await complete(
        PROFILE_SYSTEM_PROMPT,
        buildProfileUserPrompt(input),
      );

      return validateAiProfileResult(raw, input);
    },

    async generateRecommendationExplanation(
      input: AiExplanationInput,
    ): Promise<AiExplanationResult> {
      const raw = await complete(
        EXPLANATION_SYSTEM_PROMPT,
        buildExplanationUserPrompt(input),
      );

      return validateAiExplanation(raw, input);
    },
  };
}
