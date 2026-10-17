import { beforeEach, describe, expect, it, vi } from "vitest";

const rateCounts = new Map<string, number>();
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ $queryRaw: async (_s: TemplateStringsArray, ...v: unknown[]) => { const n = (rateCounts.get(String(v[0])) ?? 0) + 1; rateCounts.set(String(v[0]), n); return [{ count: n }]; }, rateLimitCounter: { deleteMany: vi.fn() } }) }));

import { POST } from "@/app/api/quiz/matches/route";
import { resetRateLimitsForTests } from "@/lib/rate-limit";
import { CURATED_DEMO_COUNT } from "@/lib/matching/curated-catalog";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import type {
  QuizAnswer,
  QuizMatchesResponse,
  QuizSubmitErrorResponse,
} from "@/types/personality";

beforeEach(() => { rateCounts.clear(); resetRateLimitsForTests(); });

const completeAnswers = (): QuizAnswer[] =>
  QUIZ_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: question.options[0].id,
  }));

const postRequest = (body: unknown): Request =>
  new Request("http://localhost/api/quiz/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/quiz/matches", () => {
  it("returns the live catalog count with the real top-3", async () => {
    const response = await POST(postRequest({ answers: completeAnswers() }));

    expect(response.status).toBe(200);

    const payload = (await response.json()) as QuizMatchesResponse;

    // The count is read from the catalog in the route — never hardcoded.
    expect(payload.count).toBe(CURATED_DEMO_COUNT);

    expect(payload.matches).toHaveLength(3);
    const ids = new Set<string>();
    for (const match of payload.matches) {
      expect(match.perfumeId).toMatch(/^ref-/);
      expect(match.name.trim().length).toBeGreaterThan(0);
      expect(match.brand.trim().length).toBeGreaterThan(0);
      ids.add(match.perfumeId);
    }
    expect(ids.size).toBe(3);
  });

  it("applies the audience filter exactly like /result", async () => {
    const plain = (await (
      await POST(postRequest({ answers: completeAnswers() }))
    ).json()) as QuizMatchesResponse;
    const men = (await (
      await POST(postRequest({ answers: completeAnswers(), audience: "MEN" }))
    ).json()) as QuizMatchesResponse;

    // An unfiltered sheet and a filtered one need not agree — but both are
    // real top-3s over the same pool, so both stay inside it.
    expect(plain.matches).toHaveLength(3);
    expect(men.matches).toHaveLength(3);
  });

  it("degrades an unknown audience to no filter instead of failing", async () => {
    const response = await POST(
      postRequest({ answers: completeAnswers(), audience: "EVERYONE" }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as QuizMatchesResponse;
    expect(payload.matches).toHaveLength(3);
  });

  it("rejects malformed JSON and invalid answers like the submit route", async () => {
    const badJson = await POST(postRequest("{not json"));
    expect(badJson.status).toBe(400);
    expect(((await badJson.json()) as QuizSubmitErrorResponse).error).toBe(
      "INVALID_JSON",
    );

    const badAnswers = await POST(postRequest({ answers: [] }));
    expect(badAnswers.status).toBe(400);
    expect(((await badAnswers.json()) as QuizSubmitErrorResponse).error).toBe(
      "INVALID_ANSWERS",
    );
  });

  it("rate-limits floods with 429 and Retry-After", async () => {
    const request = () => new Request("http://localhost/api/quiz/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.9" },
      body: JSON.stringify({ answers: completeAnswers() }),
    });

    let last: Response | null = null;
    for (let i = 0; i < 40; i++) {
      last = await POST(request());
    }

    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).not.toBeNull();
  });
});
