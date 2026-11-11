"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { archetypeEmblemImageFor } from "@/components/archetype-emblems";
import FadeInImage from "@/components/media/FadeInImage";
import MarkerWipe from "@/components/quiz/MarkerWipe";
import ProgressBar from "@/components/quiz/ProgressBar";
import Question from "@/components/quiz/Question";
import ScentRadar from "@/components/results/ScentRadar";
import StagedReveal from "@/components/results/StagedReveal";
import { BrandMark } from "@/components/ui-icons";
import WidgetAnalysis from "@/components/widget/WidgetAnalysis";
import WidgetBoot from "@/components/widget/WidgetBoot";
import WidgetHeadToHead from "@/components/widget/WidgetHeadToHead";
import WidgetRecommendationCard from "@/components/widget/WidgetRecommendationCard";
import WidgetShell from "@/components/widget/WidgetShell";
import WidgetStoreHeader from "@/components/widget/WidgetStoreHeader";
import {
  resetAnalyticsFlow,
  trackQuizCompleted,
  trackQuizStarted,
  trackWidgetViewed,
} from "@/lib/analytics/flow-tracker";
import { splitEmphasis } from "@/lib/personality/archetypes";
import { trackWidgetResultEvents } from "@/lib/widget/events";
import { QUESTION_HIGHLIGHTS, splitHighlighted } from "@/lib/personality/question-highlights";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import {
  createInitialQuizFlowState,
  getProgress,
  goNext,
  goPrevious,
  isQuizComplete,
  restartQuiz,
  selectAnswer,
  startQuizQuestions,
  toAnswers,
  type QuizFlowState,
} from "@/lib/personality/quiz-flow";
import { scoreQuiz } from "@/lib/personality/scoring";
import {
  isValidStoreId,
  type WidgetConfigResult,
  type WidgetRecommendationResponse,
  type WidgetStoreConfig,
} from "@/lib/widget/contract";
import {
  isEmbeddedWidget,
  shouldFireFromMessage,
  shouldFireWidgetViewedOnMount,
} from "@/lib/widget/visibility";
import type { QuizResult } from "@/types/personality";

/**
 * The embedded widget application (Phase 8), running inside the /widget
 * iframe on the app's own origin.
 *
 * Reuses the EXISTING pure quiz flow, questions and scorer (§6 — one canonical
 * scoring engine) and fetches recommendations from the server-side widget API
 * (§13 — the browser never scores). Every analytics event carries the widget's
 * store id (§15), fixing Phase 7's null-store limitation for widget traffic.
 *
 * Presentation (Gilded Editorial pass): the widget is the B2B sales asset, so
 * its own chrome now follows the main site instead of the Phase-8 shell —
 * an editorial intro with the signature marker wipe, the main quiz's question
 * illustration stage (it comes with the shared `Question`), the performed
 * analysis of `AnalysisInterstitial` (widget-local, same timing constants),
 * and a result that opens on the archetype's real emblem artwork with the
 * recommendations staged in after it. No emoji and no glyph substitutes: the
 * seal shows `public/archetypes/<id>.jpg` through the same resolver the main
 * site uses.
 *
 * Nothing here changes a contract: the quiz flow, scorer, widget API payload,
 * analytics events, store context, loader and resize bridge are untouched.
 */

type WidgetPhase = "validating" | "unavailable" | "intro" | "question" | "loading" | "result" | "error";

interface WidgetState {
  phase: WidgetPhase;
  flow: QuizFlowState;
  /** Public store identity from the config endpoint — powers the header. */
  store: WidgetStoreConfig | null;
  result: QuizResult | null;
  recommendations: WidgetRecommendationResponse | null;
  /**
   * The performed analysis finished its full course (or was skipped). The
   * result shows only once this AND the recommendation response are in, so an
   * early response can never cut the bar short and a late one never drops back
   * to plain text.
   */
  analysisDone: boolean;
}

const STORE_UNAVAILABLE = "این فروشگاه در حال حاضر در دسترس نیست.";
const RECOMMENDATION_ERROR = "فعلاً نتونستیم پیشنهادها رو آماده کنیم. لطفاً دوباره تلاش کنید.";
const EMPTY_INVENTORY = "فعلاً عطری برای پیشنهاد در این فروشگاه ثبت نشده است.";
/** The widget intro headline — the quiz's approved copy, byte-identical. */
const INTRO_HEADLINE = "عطر مناسب خودتون رو پیدا کنید";
const INTRO_HIGHLIGHT = splitHighlighted(INTRO_HEADLINE, QUESTION_HIGHLIGHTS.intro);

export default function WidgetApp({ storeId }: { storeId: string }) {
  const [state, setState] = useState<WidgetState>({
    phase: isValidStoreId(storeId) ? "validating" : "unavailable",
    flow: createInitialQuizFlowState(),
    store: null,
    result: null,
    recommendations: null,
    analysisDone: false,
  });

  // Embedded widgets fire WIDGET_VIEWED once, on the loader's first visibility
  // message — a local guard so a duplicate message is a no-op even before the
  // tracker's own once-guard is consulted.
  const viewedRef = useRef(false);

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

        const data = (await response.json()) as WidgetConfigResult;

        if (!data.ok) {
          throw new Error("config unavailable");
        }

        // Store is valid and active — hand over to the quiz intro, keeping the
        // customer-safe identity so every screen can show whose store it is.
        if (!cancelled) {
          setState((current) =>
            current.phase === "validating"
              ? { ...current, phase: "intro", store: data.config }
              : current,
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

  // WIDGET_VIEWED: the funnel's first step, and only when the widget was
  // actually put in front of a shopper.
  //
  //  - TOP-LEVEL (a direct visit, e.g. the owner demoing /widget): the widget is
  //    the page, so it fires when the store config resolves — unchanged.
  //  - EMBEDDED: mounting the iframe happens on page load, whether the widget is
  //    below the fold or in a background tab, so mounting proves nothing. The
  //    loader's IntersectionObserver posts `fiage-widget:visible` the first time
  //    the mount is on screen; only a message naming THIS store counts, and the
  //    once-guard means one event per visibility, never per re-render. A restart
  //    does not re-fire it (the effect does not re-run).
  useEffect(() => {
    if (state.store === null) {
      return;
    }

    if (shouldFireWidgetViewedOnMount(isEmbeddedWidget(window))) {
      trackWidgetViewed(storeId);
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) {
        return;
      }

      if (!shouldFireFromMessage(event.data, storeId, viewedRef.current)) {
        return;
      }

      viewedRef.current = true;
      window.removeEventListener("message", onMessage);
      trackWidgetViewed(storeId);
    };

    window.addEventListener("message", onMessage);

    return () => window.removeEventListener("message", onMessage);
  }, [state.store, storeId]);

  const handleStart = useCallback(() => {
    // Explicit user action → QUIZ_STARTED with the widget's store context.
    // A new attempt begins here, so prior once-guards reset first.
    resetAnalyticsFlow();
    trackQuizStarted(storeId);
    // The embedded widget keeps its frozen Phase-8 flow (no audience step, no
    // target in the widget API): the questions-only entry point preserves the
    // existing behaviour exactly, and the engine applies no gender filter.
    setState((current) => ({
      ...current,
      flow: startQuizQuestions(),
      phase: "question",
      analysisDone: false,
      recommendations: null,
    }));
  }, [storeId]);

  const handleRestart = useCallback(() => {
    resetAnalyticsFlow();
    setState((current) => ({
      ...current,
      flow: restartQuiz(),
      result: null,
      recommendations: null,
      analysisDone: false,
      phase: "intro",
    }));
  }, []);

  const handleAnalysisDone = useCallback(() => {
    setState((current) =>
      current.analysisDone ? current : { ...current, analysisDone: true },
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isQuizComplete(state.flow)) {
      return;
    }

    const answers = toAnswers(state.flow);
    // The identical pure scorer produced this profile (offline-safe).
    const result = scoreQuiz(answers);

    trackQuizCompleted(storeId);
    // A (re)try always performs the wait from the start — never a resumed bar.
    setState((current) => ({
      ...current,
      phase: "loading",
      analysisDone: false,
      recommendations: null,
    }));

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

      // RESULT_VIEWED / RECOMMENDATIONS_SHOWN are emitted once the result is
      // actually surfaced, not when the response lands: the effect below
      // promotes the phase when both the bar and the data are ready.
      setState((current) => ({
        ...current,
        result,
        recommendations: data,
      }));
    } catch {
      setState((current) => ({ ...current, phase: "error", result }));
    }
  }, [state.flow, storeId]);

  // The timing contract: results appear when BOTH the performed analysis has
  // finished its full course and the recommendation response is in. Either
  // order works — the response arriving early waits for the bar, and the bar
  // finishing early holds its completed state until the data lands.
  useEffect(() => {
    if (state.phase !== "loading" || !state.analysisDone || !state.recommendations) {
      return;
    }

    const data = state.recommendations;

    // RESULT_VIEWED / RECOMMENDATIONS_SHOWN with widget store context. The
    // helper attaches the attempt token with peek semantics (batch 44): it
    // rides along only when this attempt already minted one through
    // QUIZ_STARTED/QUIZ_COMPLETED, so a result view is joinable to its attempt
    // and the widget never fabricates an attempt of its own.
    trackWidgetResultEvents(storeId, data.recommendations);

    setState((current) =>
      current.phase === "loading" ? { ...current, phase: "result" } : current,
    );
  }, [state.phase, state.analysisDone, state.recommendations, storeId]);

  // Every phase sits under the same chrome: once the store is known, its
  // identity (logo + name) is visible on the intro, each question, the
  // analysis and the results. Before validation completes there is nothing
  // truthful to show, so the header is simply absent rather than a placeholder.
  const header = state.store ? (
    <WidgetStoreHeader name={state.store.storeName} logoUrl={state.store.logoUrl} />
  ) : null;

  // The shell owns the merchant accent (scoped to the widget only) and the one
  // privacy link every phase shows — the shopper can read what is collected
  // without leaving the quiz.
  const shell = (body: React.ReactNode) => (
    <WidgetShell accentColor={state.store?.accentColor ?? null}>
      {header}
      {body}
      <a
        href="/data-policy"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 self-center text-xs text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        حریم خصوصی و داده‌ها
      </a>
    </WidgetShell>
  );

  if (state.phase === "unavailable") {
    return shell(<WidgetNotice>{STORE_UNAVAILABLE}</WidgetNotice>);
  }

  // The boot is the INITIAL view, not a delayed one: the state above starts at
  // "validating" and the config effect replaces it with "intro" the moment the
  // store resolves. No minimum display time exists anywhere (batch 45).
  if (state.phase === "validating") {
    return shell(<WidgetBoot />);
  }

  if (state.phase === "loading") {
    return shell(
      <WidgetAnalysis
        matches={state.recommendations?.recommendations ?? []}
        onDone={handleAnalysisDone}
        onSkip={handleAnalysisDone}
      />,
    );
  }

  if (state.phase === "error") {
    return shell(
      <WidgetNotice>
        {RECOMMENDATION_ERROR}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          className="btn-primary mt-4 flex min-h-12 w-full items-center justify-center px-5 font-medium text-white"
        >
          تلاش دوباره
        </button>
        <button
          type="button"
          onClick={handleRestart}
          className="btn-tertiary mt-2 mx-auto text-sm"
        >
          شروع دوباره آزمون
        </button>
      </WidgetNotice>,
    );
  }

  if (state.phase === "result" && state.result && state.recommendations) {
    return shell(
      <WidgetResult
        storeId={storeId}
        storeSlug={state.store?.slug ?? null}
        storeWebsiteUrl={state.store?.websiteUrl ?? null}
        result={state.result}
        data={state.recommendations}
        onRestart={handleRestart}
      />,
    );
  }

  if (state.flow.phase === "intro") {
    return shell(
      <section className="quiz-rise flex flex-col gap-7 py-2">
        <div className="flex flex-col gap-3">
          <span className="quiz-badge-label w-fit rounded-full border border-accent/30 bg-accent-soft px-4 py-1 font-heading text-sm">
            <BrandMark className="ml-1 inline h-4 w-4" /> آزمون سلیقه عطری
          </span>
          <h1 className="font-display text-[2rem] font-semibold leading-[1.0] tracking-[-0.01em] text-foreground">
            {INTRO_HIGHLIGHT ? (
              <>
                {INTRO_HIGHLIGHT[0]}
                <MarkerWipe replayKey="widget-intro">{INTRO_HIGHLIGHT[1]}</MarkerWipe>
                {INTRO_HIGHLIGHT[2]}
              </>
            ) : (
              INTRO_HEADLINE
            )}
          </h1>
          <p className="font-editorial text-sm leading-8 text-muted">
            فقط به ۱۰ سؤال کوتاه جواب بدید تا ببینیم چه رایحه‌ای بیشتر با سلیقه و شخصیت عطری شما هماهنگه.
          </p>
        </div>

        <span aria-hidden="true" className="h-px w-full bg-border-soft" />

        <button
          type="button"
          onClick={handleStart}
          className="btn-primary flex min-h-12 flex-1 items-center justify-center px-5 font-medium text-white"
        >
          عطر خودتون رو پیدا کنید
        </button>
      </section>,
    );
  }

  const question = QUIZ_QUESTIONS[state.flow.questionIndex];
  const progress = getProgress(state.flow);
  const selectedOptionId = state.flow.selections[question.id];
  const isLastQuestion = state.flow.questionIndex === QUIZ_QUESTIONS.length - 1;
  const canContinue = typeof selectedOptionId === "string";

  return shell(
    <section className="flex flex-col gap-5">
      <ProgressBar current={progress.current} total={progress.total} />

      {/* No `key` here: the illustration crossfade needs `Question` to stay
          mounted across questions. It is the same shared component the quiz
          renders, so the widget inherits the transition unchanged. */}
      <Question
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
          className="btn-secondary flex min-h-12 items-center justify-center px-5 text-sm text-muted"
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
          className="btn-primary flex min-h-12 flex-1 items-center justify-center px-5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLastQuestion ? "دیدن نتیجه" : "بعدی"}
        </button>
      </div>
    </section>,
  );
}

export function WidgetResult({
  storeId,
  storeSlug,
  storeWebsiteUrl,
  result,
  data,
  onRestart,
}: {
  storeId: string;
  /** The store's public slug — the readable campaign identifier, or null. */
  storeSlug: string | null;
  /** The merchant's own site — the card's fallback CTA destination. */
  storeWebsiteUrl: string | null;
  result: QuizResult;
  data: WidgetRecommendationResponse;
  onRestart: () => void;
}) {
  const accent = result.archetype.accentColor;

  return (
    <div
      className="flex flex-col gap-6"
      style={
        {
          "--accent": accent,
          "--accent-soft": `color-mix(in srgb, ${accent} 14%, white)`,
          "--accent-contrast":
            result.archetype.id === "clean-minimalist" || result.archetype.id === "elegant-classic"
              ? "#2A2420"
              : "#FFFFFF",
        } as CSSProperties
      }
    >
      {/* --- archetype first: the arrival --- */}
      <section className="quiz-rise relative flex flex-col items-center gap-3 overflow-hidden rounded-[2rem] border border-accent/30 bg-accent-soft px-6 py-8 text-center">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 -translate-y-1/3 rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 30%, white), transparent)",
          }}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-12 top-0 h-px bg-accent/20" />

        <div className="relative flex flex-col items-center gap-3">
          <span className="font-editorial text-xs text-accent">
            <BrandMark className="ml-1 inline h-4 w-4" /> پروفایل عطری شما
          </span>

          {/* The archetype's real emblem artwork — the same
              `public/archetypes/<id>.jpg` resolver the main site uses. The
              label below carries the accessible name, so the picture is
              decorative and never announced twice. */}
          {/* The same medallion as /result, held at the widget's h-24 scale:
              3px gold ring, 25%-alpha gold halo one step outside. */}
          <span
            role="img"
            aria-label={result.archetype.label}
            className="relative mt-1 flex h-24 w-24 items-center justify-center rounded-full border-[3px] bg-background shadow-[var(--shadow-card)]"
            style={{ borderColor: "var(--marker-gold)" }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-2 rounded-full border"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--marker-gold) 25%, transparent)",
              }}
            />
            <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-full">
              <FadeInImage
                src={archetypeEmblemImageFor(result.archetype.id)}
                alt=""
                width={1600}
                height={1600}
                className="h-full w-full object-cover"
              />
            </span>
          </span>

          <h1 className="font-heading text-2xl font-bold leading-9 text-foreground">
            {result.archetype.label}
          </h1>
          <span aria-hidden="true" className="h-px w-12 bg-accent/40" />
          {/* Split, never rewritten. The accent here is the ARCHETYPE's: the
              wrapper above re-points `--accent` to `result.archetype.accentColor`,
              which shadows the store accent `WidgetShell` scopes around it. */}
          <p className="max-w-md text-sm leading-8 text-foreground/80">
            {splitEmphasis(result.archetype.description, result.archetype.emphasisWords).map(
              (segment, index) =>
                segment.emphasized ? (
                  <span key={index} className="results-emphasis">
                    {segment.text}
                  </span>
                ) : (
                  <Fragment key={index}>{segment.text}</Fragment>
                ),
            )}
          </p>
        </div>
      </section>

      {/* Batch 41 — the shopper's own scent picture: the SAME shared radar as
          /result, fed by this widget's own result vector (the one the shared
          scorer just produced), never the archetype centroid or a perfume's
          profile. It sits directly under the archetype presentation and above
          the recommendation cards, so the result reads profile-then-picks.

          Capped and centred for the loader's 480px frame: the card is 340px
          wide at most and the SVG scales by its viewBox, so there is no fixed
          pixel width and no horizontal scroll at 360px. The radar's own SVG
          cap (300px) is untouched, which keeps its axis labels legible. */}
      <div className="mx-auto w-full max-w-[340px]">
        <ScentRadar vector={result.vector} />
      </div>

      {data.recommendations.length === 0 ? (
        <WidgetNotice>{EMPTY_INVENTORY}</WidgetNotice>
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span aria-hidden="true" className="h-px w-10 bg-accent/50" />
            <span className="font-editorial text-xs text-muted">عطرهایی که بهتون میاد</span>
          </div>

          {/* Then the matches, one beat at a time (`StagedReveal`): the first
              card is in the server markup, the rest arrive on their own beats,
              and any tap or keypress on the list shows them all. Reduced
              motion renders the full list statically. */}
          <StagedReveal>
            {data.recommendations.map((recommendation) => (
              <li key={recommendation.perfumeId}>
                <WidgetRecommendationCard
                  recommendation={recommendation}
                  storeId={storeId}
                  storeSlug={storeSlug}
                  storeWebsiteUrl={storeWebsiteUrl}
                />
              </li>
            ))}
          </StagedReveal>
        </section>
      )}

      {/* Batch 40 — the merchant-facing half of head-to-head: any two of the
          top three compared side by side, ending in the same product links the
          cards offer. Needs a real pair, so fewer than two hides it. */}
      <WidgetHeadToHead
        recommendations={data.recommendations}
        storeId={storeId}
        storeSlug={storeSlug}
        storeWebsiteUrl={storeWebsiteUrl}
      />

      <button
        type="button"
        onClick={onRestart}
        className="btn-secondary flex min-h-12 items-center justify-center px-5 text-sm text-muted hover:text-foreground"
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
      className="flex min-h-32 flex-col items-center justify-center rounded-[1.5rem] border border-border-soft bg-surface px-6 py-8 text-center text-sm leading-8 text-muted"
    >
      {children}
    </div>
  );
}
