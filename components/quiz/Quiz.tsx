"use client";

import { ArrowLeftMark, BottleMark, CompassMark, StarMark } from "@/components/ui-icons";
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
  "btn-primary flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-6 font-medium disabled:cursor-not-allowed";

const secondaryButton =
  "btn-ghost flex min-h-12 items-center justify-center rounded-full px-6 text-sm disabled:cursor-not-allowed disabled:opacity-60";

const OFFLINE_NOTICE =
  "ارتباط با سرور برقرار نشد؛ پروفایل با همون محاسبه قطعی و به‌صورت آفلاین ساخته شد.";

const INTRO_POINTS = [
  { icon: StarMark, text: "کمتر از دو دقیقه وقت می‌بره." },
  { icon: CompassMark, text: "جواب درست و غلط نداره؛ گزینه‌ای رو انتخاب کن که بهت نزدیک‌تره." },
  { icon: BottleMark, text: "نتیجه یک تحلیل سلیقه‌ای برای انتخاب عطره، نه یک تست روانشناسی." },
] as const;

/**
 * The quiz surface: intro → one question per screen → result.
 *
 * Every transition comes from the pure state machine in
 * `lib/personality/quiz-flow`, so this component holds no scoring logic.
 *
 * `storeId` (Phase 9): an optional store context, passed down from the page
 * (`/quiz?store=…`). When present, analytics events carry it and the results
 * URL pins that store instead of the default — this is how standalone traffic
 * gets the same store attribution the Phase 8 widget already has.
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
      <section className="quiz-rise flex flex-1 flex-col justify-center gap-8 py-8 sm:gap-10">
        <span className="eyebrow flex w-fit items-center gap-2 rounded-full border border-champagne/35 bg-champagne/5 px-4 py-1.5 text-champagne">
          <StarMark className="h-3.5 w-3.5" />
          آزمون سلیقه عطری
        </span>

        <h1 className="display-xl max-w-lg text-ivory">عطر مناسب خودت رو پیدا کن</h1>

        <p className="lead max-w-xl">
          فقط به ۱۰ سؤال کوتاه جواب بده تا ببینیم چه رایحه‌ای بیشتر با سلیقه و شخصیت
          عطری تو هماهنگ است.
        </p>

        <ul className="grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-border-soft sm:grid-cols-3">
          {INTRO_POINTS.map((point) => (
            <li
              key={point.text}
              className="flex flex-col gap-2 bg-surface/40 p-4 text-xs leading-7 text-muted sm:p-5"
            >
              <point.icon className="h-4 w-4 text-celestial" />
              {point.text}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <button
            type="button"
            onClick={() => {
              // The shopper explicitly enters the quiz — the QUIZ_STARTED
              // moment (§6). Never fired by homepage loads or renders.
              trackQuizStarted(storeId);
              setFlow(startQuiz());
            }}
            className="btn-primary flex min-h-12 items-center justify-center gap-2 rounded-full px-8 text-base font-medium sm:w-fit sm:px-10"
          >
            شروع آزمون
            <ArrowLeftMark className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted">۱۰ سؤال · بدون ثبت‌نام · نتیجه بلافاصله</span>
        </div>
      </section>
    );
  }

  const question = QUIZ_QUESTIONS[flow.questionIndex];
  const progress = getProgress(flow);
  const selectedOptionId = flow.selections[question.id];
  const isLastQuestion = flow.questionIndex === QUIZ_QUESTIONS.length - 1;
  const canContinue = typeof selectedOptionId === "string";

  return (
    <section className="flex flex-1 flex-col gap-8 py-4 sm:justify-center">
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
          {isLastQuestion && !submitting ? <ArrowLeftMark className="h-4 w-4" /> : null}
        </button>
      </div>

      <button
        type="button"
        onClick={handleRestart}
        className="mx-auto text-xs text-muted underline underline-offset-4 transition-colors hover:text-ivory"
      >
        شروع دوباره
      </button>
    </section>
  );
}
