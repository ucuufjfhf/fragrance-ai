import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MATCHES_TIMEOUT_MS,
  fetchMatchesPreview,
} from "@/lib/quiz/matches-preview";
import type { QuizMatchesResponse } from "@/types/personality";

const answers = [{ questionId: "day-trip", optionId: "unknown-road" }];

const payload: QuizMatchesResponse = {
  count: 3,
  matches: [
    { perfumeId: "a", name: "A", brand: "House A" },
    { perfumeId: "b", name: "B", brand: "House B" },
    { perfumeId: "c", name: "C", brand: "House C" },
  ],
};

function okResponse(): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

describe("matches preview timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("covers a cold server compile (10s, not the old 2.5s)", () => {
    expect(MATCHES_TIMEOUT_MS).toBe(10000);
  });

  it("still plays the beats when the preview resolves within the limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse()),
    );

    const result = await fetchMatchesPreview(answers, null);

    expect(result).toEqual(payload);
  });

  it("degrades gracefully (null, never throws) past the new limit", async () => {
    // A compile slower than the whole 10s budget: the promise never settles.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<never>(() => {})));

    const pending = fetchMatchesPreview(answers, null);
    await vi.advanceTimersByTimeAsync(MATCHES_TIMEOUT_MS + 1);

    await expect(pending).resolves.toBeNull();
  });

  it("degrades gracefully on HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );

    await expect(fetchMatchesPreview(answers, null)).resolves.toBeNull();
  });

  it("degrades gracefully on a malformed payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({ count: "three", matches: [] }),
          }) as Response,
      ),
    );

    await expect(fetchMatchesPreview(answers, null)).resolves.toBeNull();
  });
});
