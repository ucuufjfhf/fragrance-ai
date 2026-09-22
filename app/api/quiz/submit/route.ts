import { scoreQuiz, validateAnswers } from "@/lib/personality/scoring";
import type {
  QuizSubmitErrorResponse,
  QuizSubmitResponse,
} from "@/types/personality";

/**
 * POST /api/quiz/submit
 *
 * Deterministic personality scoring. The body is `{ answers: QuizAnswer[] }` with
 * exactly one answer per question.
 *
 * Phase 1 note: this endpoint is a pure function of its input — no database, no
 * session, no AI. Anything that could fail (AI, storage) is added in later
 * phases and must never be able to change the score computed here.
 *
 * Responses:
 *  - 200 `QuizSubmitResponse`      for a valid answer sheet
 *  - 400 `QuizSubmitErrorResponse` for malformed JSON or invalid answers
 */
export async function POST(request: Request): Promise<Response> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    const body: QuizSubmitErrorResponse = {
      error: "INVALID_JSON",
      reason: "request body must be valid JSON.",
    };
    return Response.json(body, { status: 400 });
  }

  const answers =
    typeof payload === "object" && payload !== null
      ? (payload as { answers?: unknown }).answers
      : undefined;

  const validation = validateAnswers(answers);

  if (!validation.ok) {
    const body: QuizSubmitErrorResponse = {
      error: "INVALID_ANSWERS",
      reason: validation.reason,
    };
    return Response.json(body, { status: 400 });
  }

  const body: QuizSubmitResponse = { result: scoreQuiz(validation.answers) };
  return Response.json(body, { status: 200 });
}
