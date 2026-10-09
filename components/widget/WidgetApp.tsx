"use client";

import { useCallback, useEffect, useState } from "react";

import { ArrowLeftMark, BottleMark, StarMark } from "@/components/ui-icons";

import { CosmicBackdrop } from "@/components/cosmic/cosmic-visuals";
import ProgressBar from "@/components/quiz/ProgressBar";

import Question from "@/components/quiz/Question";
import WidgetRecommendationCard from "@/components/widget/WidgetRecommendationCard";
import { trackEvent } from "@/lib/analytics/client";
import {
  resetAnalyticsFlow,
  trackQuizCompleted,
  trackQuizStarted,
} from "@/lib/analytics/flow-tracker";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import {
  createInitialQuizFlowState,
  getProgress,
  goNext,
  goPrevious,
  isQuizComplete,
  restartQuiz,
  selectAnswer,
  startQuiz,
  toAnswers,
  type QuizFlowState,
} from "@/lib/personality/quiz-flow";
import { scoreQuiz } from "@/lib/personality/scoring";
import { isValidStoreId, type WidgetRecommendationResponse } from "@/lib/widget/contract";
import type { QuizResult } from "@/types/personality";

/**
 * The embedded widget application (Phase 8), running inside the /widget
 * iframe on the app's own origin.
 *
 * Reuses the EXISTING pure quiz flow, questions and scorer (§6 — one canonical
 * scoring engine) and fetches recommendations from the server-side widget API
 * (§13 — the browser never scores). Every analytics event carries the widget's
 * store id (§15), fixing Phase 7's null-store limitation for widget traffic.
 */

type WidgetPhase = "validating" | "unavailable" | "intro" | "question" | "loading" | "result" | "error";

interface WidgetState {
  phase: WidgetPhase;
  flow: QuizFlowState;
  result: QuizResult | null;
  recommendations: WidgetRecommendationResponse | null;
}

const STORE_UNAVAILABLE = "این فروشگاه در حال حاضر در دسترس نیست.";
const RECOMMENDATION_ERROR = "فعلاً نتونستیم پیشنهادها رو آماده کنیم. لطفاً دوباره تلاش کن.";
const EMPTY_INVENTORY = "فعلاً عطری برای پیشنهاد در این فروشگاه ثبت نشده.";
const LOADING = "در حال پیدا کردن عطر مناسب تو...";

export default function WidgetApp({ storeId }: { storeId: string }) {
  const [state, setState] = useState<WidgetState>({
    phase: isValidStoreId(storeId) ? "validating" : "unavailable",
    flow: createInitialQuizFlowState(),
    result: null,
    recommendations: null,
  });

  // --- store validation through the public config endpoint (§11) ---
  useEffect(() => {
    if (state.phase !== "validating") {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/widget/config?storeId=${encodeURIComponent(storeId)}`);

        if (!response.ok) {
          throw new Error(`config ${response.status}`);
        }

        // Store is valid and active — hand over to the quiz intro.
        if (!cancelled) {
          setState((current) =>
            current.phase === "validating" ? { ...current, phase: "intro" } : current,
          );
        }
      } catch {
        if (!cancelled) {
          setState((current) => ({ ...current, phase: "unavailable" }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.phase, storeId]);

  const handleStart = useCallback(() => {
    // Explicit user action → QUIZ_STARTED with the widget's store context.
    // A new attempt begins here, so prior once-guards reset first.
    resetAnalyticsFlow();
    trackQuizStarted(storeId);
    setState((current) => ({ ...current, flow: startQuiz(), phase: "question" }));
  }, [storeId]);

  const handleRestart = useCallback(() => {
    resetAnalyticsFlow();
    setState((current) => ({
      ...current,
      flow: restartQuiz(),
      result: null,
      recommendations: null,
      phase: "intro",
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isQuizComplete(state.flow)) {
      return;
    }

    const answers = toAnswers(state.flow);
    // The identical pure scorer produced this profile (offline-safe).
    const result = scoreQuiz(answers);

    trackQuizCompleted(storeId);
    setState((current) => ({ ...current, phase: "loading" }));

    try {
      const response = await fetch("/api/widget/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, personalityVector: result.vector }),
      });

      if (!response.ok) {
        throw new Error(`recommend ${response.status}`);
      }

      const data = (await response.json()) as WidgetRecommendationResponse & { ok: boolean };

      // RESULT_VIEWED / RECOMMENDATIONS_SHOWN with widget store context.
      void trackEvent({ eventType: "RESULT_VIEWED", storeId });
      void trackEvent({
        eventType: "RECOMMENDATIONS_SHOWN",
        storeId,
        metadata: { count: data.recommendations.length },
      });

      setState((current) => ({
        ...current,
        phase: "result",
        result,
        recommendations: data,
      }));
    } catch {
      setState((current) => ({ ...current, phase: "error", result }));
    }
  }, [state.flow, storeId]);

  if (state.phase === "unavailable") {
    return <WidgetNotice>{STORE_UNAVAILABLE}</WidgetNotice>;
  }

  if (state.phase === "validating") {
    return <WidgetNotice>{LOADING}</WidgetNotice>;
  }

  if (state.phase === "loading") {
    return <WidgetNotice>{LOADING}</WidgetNotice>;
  }

  if (state.phase === "error") {
    return (
      <WidgetNotice>
        {RECOMMENDATION_ERROR}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          className="btn-primary mt-4 flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-medium"
        >
          تلاش دوباره
        </button>
        <button
          type="button"
          onClick={handleRestart}
          className="btn-ghost mt-2 flex min-h-11 w-full items-center justify-center rounded-full px-5 text-xs"
        >
          شروع دوباره آزمون
        </button>
      </WidgetNotice>
    );
  }

  if (state.phase === "result" && state.result && state.recommendations) {
    return (
      <WidgetResult
        storeId={storeId}
        result={state.result}
        data={state.recommendations}
        onRestart={handleRestart}
      />
    );
  }

  if (state.flow.phase === "intro") {
    return (
      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border-soft bg-surface">
        {/* Narrow night header — the widget's only atmospheric moment. */}
        <div data-surface="dark" className="relative isolate overflow-hidden bg-night">
          <CosmicBackdrop stars={14} seed={9} atmosphere={false} constellation={false} intensity={0.6} />
          <div className="relative z-10 flex flex-col gap-2 px-5 py-6">
            <span className="eyebrow flex items-center gap-2 text-champagne">
              <StarMark className="h-3 w-3" />
              آزمون سلیقه عطری
            </span>
            <h1 className="display-md text-ivory">عطر مناسب خودت رو پیدا کن</h1>
            <p className="text-xs leading-7 text-muted">
              فقط به ۱۰ سؤال کوتاه جواب بده تا ببینیم چه رایحه‌ای بیشتر با سلیقه و
              شخصیت عطری تو هماهنگه.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-5 py-5">
          <button
            type="button"
            onClick={handleStart}
            className="btn-primary flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 font-medium"
          >
            عطر خودتو پیدا کن
            <ArrowLeftMark className="h-4 w-4" />
          </button>
          <span className="text-center text-[0.68rem] text-muted">
            ۱۰ سؤال · کمتر از دو دقیقه · بدون ثبت‌نام
          </span>
        </div>
      </section>
    );
  }

  const question = QUIZ_QUESTIONS[state.flow.questionIndex];
  const progress = getProgress(state.flow);
  const selectedOptionId = state.flow.selections[question.id];
  const isLastQuestion = state.flow.questionIndex === QUIZ_QUESTIONS.length - 1;
  const canContinue = typeof selectedOptionId === "string";

  return (
    <section className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-4 sm:p-5">
      <ProgressBar current={progress.current} total={progress.total} />

      <Question
        key={question.id}
        question={question}
        selectedOptionId={selectedOptionId}
        onSelect={(_questionId, optionId) =>
          setState((current) => ({ ...current, flow: selectAnswer(current.flow, question.id, optionId) }))
        }
      />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setState((current) => ({ ...current, flow: goPrevious(current.flow) }))}
          className="btn-ghost flex min-h-12 items-center justify-center rounded-full px-5 text-sm"
        >
          قبلی
        </button>
        <button
          type="button"
          disabled={!canContinue}
          onClick={() => {
            if (isLastQuestion) {
              void handleSubmit();
            } else {
              setState((current) => ({ ...current, flow: goNext(current.flow) }));
            }
          }}
          className="btn-primary flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 font-medium disabled:cursor-not-allowed"
        >
          {isLastQuestion ? "دیدن نتیجه" : "بعدی"}
          {isLastQuestion ? <ArrowLeftMark className="h-4 w-4" /> : null}
        </button>
      </div>
    </section>
  );
}

function WidgetResult({
  storeId,
  result,
  data,
  onRestart,
}: {
  storeId: string;
  result: QuizResult;
  data: WidgetRecommendationResponse;
  onRestart: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <section
        data-surface="dark"
        className="relative isolate overflow-hidden rounded-[var(--radius-lg)] border border-border-soft bg-night"
      >
        <CosmicBackdrop stars={18} seed={21} atmosphere={false} constellation={false} intensity={0.7} />
        <div className="relative z-10 flex flex-col items-center gap-2 px-5 py-7 text-center">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-full border"
            style={{ borderColor: `color-mix(in srgb, ${result.archetype.accentColor} 75%, transparent)` }}
          >
            <BottleMark className="h-5 w-5 text-ivory/85" />
          </span>
          <span className="eyebrow flex items-center gap-2 text-champagne">
            <StarMark className="h-3 w-3" />
            پروفایل عطری تو
          </span>
          <h1 className="display-md text-ivory">{result.archetype.label}</h1>
          <p className="text-xs leading-8 text-muted">{result.archetype.description}</p>
        </div>
      </section>

      {data.recommendations.length === 0 ? (
        <WidgetNotice>{EMPTY_INVENTORY}</WidgetNotice>
      ) : (
        <ol className="flex list-none flex-col gap-4">
          {data.recommendations.map((recommendation) => (
            <li key={recommendation.perfumeId}>
              <WidgetRecommendationCard
                recommendation={recommendation}
                storeId={storeId}
              />
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        onClick={onRestart}
        className="btn-ghost flex min-h-12 items-center justify-center rounded-full px-5 text-sm"
      >
        شروع دوباره
      </button>

      <p className="text-xs leading-7 text-muted">
        این نتیجه یک تحلیل سلیقه‌ای برای انتخاب عطر است، نه یک تست روانشناسی.
      </p>
    </div>
  );
}

function WidgetNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex min-h-32 flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-6 text-center text-sm leading-8 text-muted"
    >
      <StarMark className="h-4 w-4 text-champagne-deep/70" />
      {children}
    </div>
  );
}
