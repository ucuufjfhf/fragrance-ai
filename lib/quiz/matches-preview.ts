import type { AudienceGender } from "@/lib/audience";
import type { QuizMatchesResponse } from "@/types/personality";

/**
 * How long the submit waits for the matches preview before giving up on the
 * Phase 2 beats. The preview is fetched in parallel with the submit; on a
 * warm server it resolves near-instantly (local engine, no AI), but a cold
 * dev server routinely spends seconds compiling the route first — so the
 * limit comfortably covers a cold compile while still bounding the wait.
 * If the preview ever hangs past this, the flow degrades to the pre-Phase-2
 * path instead of stalling the shopper.
 */
export const MATCHES_TIMEOUT_MS = 10000;

/**
 * Dev-only one-liner naming why the beats were skipped. Silent degradation
 * hid a too-short timeout for a whole session, so the cause is always said
 * out loud in development (never in production or test output).
 */
function warnSkipped(cause: string): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[quiz] Phase 2 beats skipped — matches preview ${cause}.`);
  }
}

/**
 * Fetches the Phase 2 beats' data (live catalog count + real top-3) for an
 * answer sheet. Never throws: any failure (network, timeout, malformed
 * payload, empty matches) resolves to null, and the caller skips the beats.
 */
export async function fetchMatchesPreview(
  answers: { questionId: string; optionId: string }[],
  audience: AudienceGender | null,
): Promise<QuizMatchesResponse | null> {
  let response: Response;
  try {
    response = await Promise.race([
      fetch("/api/quiz/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, audience }),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`timed out after ${MATCHES_TIMEOUT_MS}ms`)),
          MATCHES_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (error) {
    warnSkipped(
      error instanceof Error ? `failed (${error.message})` : "failed",
    );
    return null;
  }

  if (!response.ok) {
    warnSkipped(`failed (HTTP ${response.status})`);
    return null;
  }

  const data = (await response.json()) as QuizMatchesResponse;

  if (
    typeof data?.count !== "number" ||
    !Array.isArray(data?.matches) ||
    data.matches.length === 0
  ) {
    warnSkipped("failed (malformed payload)");
    return null;
  }

  return data;
}
