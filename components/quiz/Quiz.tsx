"use client";

import { BrandMark } from "@/components/ui-icons";
import { useCallback, useState } from "react";

import {
  resetAnalyticsFlow,
  trackQuizCompleted,
  trackQuizStarted,
} from "@/lib/analytics/flow-tracker";

import ProgressBar from "@/components/quiz/ProgressBar";
import Question from "@/components/quiz/Question";
import QuizResultCard from "@/components/quiz/QuizResultCard";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import {
  createInitialQuizFlowState,
  getProgress,
  goNext,
  goPrevious,
  isQuizComplete,
  restartQuiz,
  selectAnswer,
  showResult,
  startQuiz,
  toAnswers,
  type QuizFlowState,
} from "@/lib/personality/quiz-flow";
import { scoreQuiz } from "@/lib/personality/scoring";
import type { QuizResult, QuizSubmitResponse } from "@/types/personality";

const primaryButton =
  "flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-accent px-5 font-medium text-background transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButton =
  "flex min-h-12 items-center justify-center rounded-2xl border border-border-soft px-5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

const OFFLINE_NOTICE =
  "ارتباط با سرور برقرار نشد؛ پروفایل با همون محاسبه قطعی و به‌صورت آفلاین ساخته شد.";

/**
 * The quiz surface: intro → one question per screen → result.
 *
 * Every transition comes from the pure state machine in
 * `lib/personality/quiz-flow`, so this component holds no scoring logic.
 *
 * `storeId` (Phase 9): an optional store context, passed down from the page
 * (`/quiz?store=…`). When present, analytics events carry it and the results
 * URL pins that store instead of the default — this is how standalone traffic
 * gets the same store attribution the Phase 8 widget already has. No store
 * selector is ever shown to the shopper (§10 Phase 8: the merchant picks the
 * store at installation time, never the customer).
 */
export default function Quiz({ storeId }: { storeId?: string }) {
  const [flow, setFlow] = useState<QuizFlowState>(createInitialQuizFlowState);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSelect = useCallback((questionId: string, optionId: string) => {
    setFlow((current) => selectAnswer(current, questionId, optionId));
  }, []);

  const handleRestart = useCallback(() => {
    // A restart begins a NEW anonymous attempt: clear the once-guards so its
    // QUIZ_STARTED / QUIZ_COMPLETED events fire again (Phase 7).
    resetAnalyticsFlow();
    setResult(null);
    setNotice(null);
    setSubmitting(false);
    setFlow(restartQuiz());
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isQuizComplete(flow)) {
      return;
    }

    const answers = toAnswers(flow);
    setSubmitting(true);
    setNotice(null);

    try {
      const response = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });

      if (!response.ok) {
        throw new Error(`quiz API answered with ${response.status}`);
      }

      const data = (await response.json()) as QuizSubmitResponse;
      setResult(data.result);
      // A valid personality vector exists — the QUIZ_COMPLETED moment (§6).
      // The offline fallback below records the same event: both paths
      // produced a real result through the same deterministic scorer.
      trackQuizCompleted(storeId);
    } catch {
      // The engine is deterministic and shared with the client, so the browser
      // can compute the identical profile when the API is unreachable.
      setResult(scoreQuiz(answers));
      setNotice(OFFLINE_NOTICE);
      trackQuizCompleted(storeId);
    } finally {
      setSubmitting(false);
      setFlow((current) => showResult(current));
    }
  }, [flow, storeId]);

  if (flow.phase === "result" && result) {
    return (
      <QuizResultCard
        result={result}
        notice={notice}
        onRestart={handleRestart}
        storeId={storeId}
      />
    );
  }

  if (flow.phase === "intro") {
    return (
      <section className="quiz-rise flex flex-col gap-6 rounded-3xl border border-border-soft bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-3">
          <span className="w-fit rounded-full border border-border-soft bg-surface-2 px-4 py-1 text-sm text-accent">
            <BrandMark className="ml-1 inline h-4 w-4" /> آزمون سلیقه عطری
          </span>
          <h1 className="text-2xl font-bold leading-10 sm:text-3xl">
            عطر مناسب خودت رو پیدا کن
          </h1>
          <p className="text-muted">
            فقط به ۱۰ سؤال کوتاه جواب بده تا ببینیم چه رایحه‌ای بیشتر با سلیقه و
            شخصیت عطری تو هماهنگه.
          </p>
        </div>

        <ul className="flex flex-col gap-2 text-sm text-muted">
          <li>⏱ کمتر از دو دقیقه وقت می‌بره.</li>
          <li>🧠 جواب درست و غلط نداره؛ هر گزینه‌ای که بهت نزدیک‌تره رو انتخاب کن.</li>
          <li>🕵️ نتیجه یک تحلیل سلیقه‌ای برای انتخاب عطره، نه یک تست روانشناسی.</li>
        </ul>

        <button
          type="button"
          onClick={() => {
            // The shopper explicitly enters the quiz — the QUIZ_STARTED
            // moment (§6). Never fired by homepage loads or renders.
            trackQuizStarted(storeId);
            setFlow(startQuiz());
          }}
          className={primaryButton}
        >
          شروع آزمون
        </button>
      </section>
    );
  }

  const question = QUIZ_QUESTIONS[flow.questionIndex];
  const progress = getProgress(flow);
  const selectedOptionId = flow.selections[question.id];
  const isLastQuestion = flow.questionIndex === QUIZ_QUESTIONS.length - 1;
  const canContinue = typeof selectedOptionId === "string";

  return (
    <section className="flex flex-col gap-6 rounded-3xl border border-border-soft bg-surface p-5 sm:p-8">
      <ProgressBar current={progress.current} total={progress.total} />

      <div key={question.id} className="quiz-rise">
        <Question
          question={question}
          selectedOptionId={selectedOptionId}
          onSelect={handleSelect}
        />
      </div>

      {submitting ? (
        <p className="text-sm text-muted" aria-live="polite">
          در حال ساخت پروفایل عطری…
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setFlow((current) => goPrevious(current))}
          disabled={flow.questionIndex === 0 || submitting}
          className={secondaryButton}
        >
          قبلی
        </button>
        <button
          type="button"
          onClick={
            isLastQuestion
              ? handleSubmit
              : () => setFlow((current) => goNext(current))
          }
          disabled={!canContinue || submitting}
          className={primaryButton}
        >
          {isLastQuestion
            ? submitting
              ? "داره حساب می‌شه…"
              : "دیدن پروفایل عطری من"
            : "بعدی"}
        </button>
      </div>

      <button
        type="button"
        onClick={handleRestart}
        className="mx-auto text-xs text-muted underline underline-offset-4 transition-colors hover:text-foreground"
      >
        شروع دوباره
      </button>
    </section>
  );
}
