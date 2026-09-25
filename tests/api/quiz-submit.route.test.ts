import { beforeEach, describe, expect, it, vi } from "vitest";

const rateCounts = new Map<string, number>();
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ $queryRaw: async (_s: TemplateStringsArray, ...v: unknown[]) => { const n = (rateCounts.get(String(v[0])) ?? 0) + 1; rateCounts.set(String(v[0]), n); return [{ count: n }]; }, rateLimitCounter: { deleteMany: vi.fn() } }) }));

import { POST } from "@/app/api/quiz/submit/route";
import { resetRateLimitsForTests } from "@/lib/rate-limit";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";
import type {
  QuizAnswer,
  QuizSubmitErrorResponse,
  QuizSubmitResponse,
} from "@/types/personality";

const PERSIAN_TEXT = /[\u0600-\u06FF]/;

beforeEach(() => { rateCounts.clear(); resetRateLimitsForTests(); });

const completeAnswers = (): QuizAnswer[] =>
  QUIZ_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: question.options[0].id,
  }));

const postRequest = (body: unknown): Request =>
  new Request("http://localhost/api/quiz/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/quiz/submit", () => {
  it("answers with the deterministic profile for a valid answer sheet", async () => {
    const answers = completeAnswers();
    const response = await POST(postRequest({ answers }));

    expect(response.status).toBe(200);

    const payload = (await response.json()) as QuizSubmitResponse;
    const expected = scoreQuiz(answers);

    expect(payload.result.vector).toEqual(expected.vector);
    expect(payload.result.archetype.id).toBe(expected.archetype.id);
    expect(payload.result.answers).toEqual(answers);
    expect(payload.result.archetype.label).toMatch(PERSIAN_TEXT);
  });

  it("keeps every returned score inside 0–100", async () => {
    const answers: QuizAnswer[] = QUIZ_QUESTIONS.map((question) => ({
      questionId: question.id,
      optionId: question.options[question.options.length - 1].id,
    }));

    const response = await POST(postRequest({ answers }));
    const payload = (await response.json()) as QuizSubmitResponse;

    for (const value of Object.values(payload.result.vector)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("allows normal submissions and returns 429 with Retry-After when flooded", async () => {
    const request = () => new Request("http://localhost/api/quiz/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.8" },
      body: JSON.stringify({ answers: completeAnswers() }),
    });

    for (let index = 0; index < 30; index += 1) {
      expect((await POST(request())).status).toBe(200);
    }

    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/);
    expect(((await response.json()) as QuizSubmitErrorResponse).error).toBe("RATE_LIMITED");
  });

  it("rejects malformed JSON with 400", async () => {
    const response = await POST(postRequest("{ this is not json"));

    expect(response.status).toBe(400);

    const payload = (await response.json()) as QuizSubmitErrorResponse;

    expect(payload.error).toBe("INVALID_JSON");
    expect(payload.reason.length).toBeGreaterThan(0);
  });

  it("rejects incomplete, unknown or mistyped answers with 400", async () => {
    const bodies: unknown[] = [
      {},
      { answers: null },
      { answers: [] },
      { answers: completeAnswers().slice(0, 3) },
      { answers: completeAnswers().map(() => ({ questionId: "nope", optionId: "nope" })) },
      { answers: "not-an-array" },
    ];

    for (const body of bodies) {
      const response = await POST(postRequest(body));

      expect(response.status, JSON.stringify(body)).toBe(400);

      const payload = (await response.json()) as QuizSubmitErrorResponse;

      expect(payload.error).toBe("INVALID_ANSWERS");
      expect(payload.reason.length).toBeGreaterThan(0);
    }
  });
});
