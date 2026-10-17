"use client";

import { BrandMark } from "@/components/ui-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {
  resetAnalyticsFlow,
  trackQuizCompleted,
  trackQuizStarted,
} from "@/lib/analytics/flow-tracker";

import AnalysisInterstitial from "@/components/quiz/AnalysisInterstitial";
import AudienceStep from "@/components/quiz/AudienceStep";
import ContextStep from "@/components/quiz/ContextStep";
import FilteringCountdown from "@/components/quiz/FilteringCountdown";
import MarkerWipe from "@/components/quiz/MarkerWipe";
import {
  QUESTION_HIGHLIGHTS,
  splitHighlighted,
} from "@/lib/personality/question-highlights";
import ProgressBar from "@/components/quiz/ProgressBar";
import Question from "@/components/quiz/Question";
import QuizAtmosphere, {
  ANSWER_PULSE_MS,
  MAX_LIVE_PULSES,
  bloomTintFor,
  withInkBloom,
  type AnswerPulse,
  type InkBloom,
} from "@/components/quiz/QuizAtmosphere";
import QuizResultCard from "@/components/quiz/QuizResultCard";
import QuizSpray from "@/components/quiz/QuizSpray";
import type { AudienceGender } from "@/lib/audience";
import type { Occasion } from "@/types/fragrance";
import type { SeasonFilter } from "@/lib/context";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import {
  createInitialQuizFlowState,
  getProgress,
  goNext,
  goPrevious,
  isQuizComplete,
  openContext,
  restartQuiz,
  returnToResult,
  selectAnswer,
  selectAudience,
  selectOccasion,
  selectSeason,
  showAnalysis,
  showFiltering,
  showResult,
  startQuiz,
  toAnswers,
  type QuizFlowState,
} from "@/lib/personality/quiz-flow";
import { scoreQuiz } from "@/lib/personality/scoring";
import { serializeResultsParams } from "@/lib/results/params";
import type {
  QuizMatchesResponse,
  QuizResult,
  QuizSubmitResponse,
} from "@/types/personality";

const primaryButton =
  "btn-primary flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent px-6 font-medium text-background disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButton =
  "flex min-h-12 items-center justify-center rounded-2xl border border-border-soft bg-surface px-6 text-sm text-muted transition-colors hover:border-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

const OFFLINE_NOTICE =
  "ارتباط با سرور برقرار نشد؛ پروفایل با همون محاسبه قطعی و به‌صورت آفلاین ساخته شد.";

/** How long a recorded pointer position stays usable as a ripple origin. */
const POINTER_FRESH_MS = 1500;

/**
 * How long the submit waits for the matches preview before giving up on the
 * Phase 2 beats. The preview is fetched in parallel with the submit and
 * resolves near-instantly (local engine, no AI); if it ever hangs, the flow
 * degrades to the pre-Phase-2 path instead of stalling the shopper.
 */
const MATCHES_TIMEOUT_MS = 2500;

/**
 * Fetches the Phase 2 beats' data (live catalog count + real top-3) for an
 * answer sheet. Never throws: any failure (network, timeout, malformed
 * payload, empty matches) resolves to null, and the caller skips the beats.
 */
async function fetchMatchesPreview(
  answers: { questionId: string; optionId: string }[],
  audience: AudienceGender | null,
): Promise<QuizMatchesResponse | null> {
  try {
    const response = await Promise.race([
      fetch("/api/quiz/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, audience }),
      }),
      new Promise<never>((_, reject) =>
        window.setTimeout(
          () => reject(new Error("matches preview timed out")),
          MATCHES_TIMEOUT_MS,
        ),
      ),
    ]);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as QuizMatchesResponse;

    if (
      typeof data?.count !== "number" ||
      !Array.isArray(data?.matches) ||
      data.matches.length === 0
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

interface PointerRecord {
  x: number;
  y: number;
  at: number;
}

/**
 * The answered option row's centre, in viewport coordinates — the bloom's
 * anchor, and the ripple's fallback origin for keyboard answers.
 *
 * Read from the DOM rather than threaded through `Question`/`QuizOption`: the
 * row button already carries `data-question-id` / `data-option-id`, so
 * measuring here keeps this strictly presentational wiring (no component API
 * changes) and it works for a keyboard answer exactly like a tap. Returns null
 * where there is no layout (SSR), and the decoration is then simply skipped.
 */
function optionCenter(questionId: string, optionId: string): { x: number; y: number } | null {
  if (typeof document === "undefined") {
    return null;
  }

  const escape = (value: string) =>
    typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value;
  const card = document.querySelector<HTMLElement>(
    `button[data-question-id="${escape(questionId)}"][data-option-id="${escape(optionId)}"]`,
  );
  if (!card) {
    return null;
  }

  const rect = card.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }

  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * The app router when one is mounted, null in static-render tests.
 *
 * `useRouter()` throws without the app-router context, which server-side
 * render smoke tests never provide — so the hook call is guarded and the skip
 * handler falls back to a plain navigation. In the browser the router always
 * exists and the skip stays a client-side transition.
 */
function useOptionalRouter(): { push(href: string): void } | null {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

/** The last pointer position — only while it is recent enough to be "this tap". */
function freshPointerPoint(record: PointerRecord | null): { x: number; y: number } | null {
  if (!record || Date.now() - record.at > POINTER_FRESH_MS) {
    return null;
  }
  return { x: record.x, y: record.y };
}

/** Read at interaction time (never during render), so SSR can never disagree. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A quiet framed mark for the intro's three supporting notes (no emoji). */
function IntroGlyph({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
    >
      {children}
    </span>
  );
}

const glyphProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-3.5 w-3.5",
};

/**
 * The quiz surface: intro → audience → one question per screen → filtering →
 * analysis → result → optional context.
 *
 * `filtering` (countdown) and `analysis` (performed interstitial) are the
 * Phase 2 pacing beats between the submit and the result. Both are decoration
 * over data the matches preview already fetched: a failed preview skips them
 * via `showResult`, and the interstitial's skip jumps straight to /result.
 *
 * The audience screen is a separate step, not a personality question: it is not
 * part of the 10-question bank, is never counted in the progress label, and its
 * answer travels to the results URL as a compact target token (never into the
 * personality vector).
 *
 * The context screen (season + occasion) is the other non-question step: it
 * comes after the personality result and before the recommendations link, and
 * its selections travel as optional `season`/`occasion` URL tokens — likewise
 * never into the personality vector.
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
  // The Phase 2 beats' data (live count + real top-3), fetched in parallel
  // with the submit. Null until a submit succeeds AND the preview arrives —
  // the beats only ever render with both in hand.
  const [preview, setPreview] = useState<QuizMatchesResponse | null>(null);
  const router = useOptionalRouter();

  // Each question screen is a fresh step: when the flow moves to another
  // question, the content replays one subtle slide-and-fade instead of snapping
  // into place. The screen key is derived from the flow only — it never affects
  // the flow, scoring or routing.
  const screenKey = `${flow.phase}:${flow.questionIndex}`;
  const [stepEntered, setStepEntered] = useState(true);
  const previousScreen = useRef(screenKey);

  useEffect(() => {
    if (previousScreen.current === screenKey) {
      return;
    }
    previousScreen.current = screenKey;
    setStepEntered(false);
    const frame = requestAnimationFrame(() => setStepEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [screenKey]);

  // Act 2's layers are presentation only: they READ the flow (selections) and
  // the pointer, and write nothing back into it.
  const [blooms, setBlooms] = useState<readonly InkBloom[]>([]);
  const [pulses, setPulses] = useState<readonly AnswerPulse[]>([]);

  // The last pointer press, in viewport coordinates — the ripple's origin. A
  // passive window listener, so it can never delay or swallow the tap itself.
  const pointer = useRef<PointerRecord | null>(null);
  useEffect(() => {
    const record = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY, at: Date.now() };
    };
    window.addEventListener("pointerdown", record, { passive: true });
    return () => window.removeEventListener("pointerdown", record);
  }, []);

  // Ripples remove themselves from the DOM; the timers are tracked so a restart
  // or an unmount cannot leave a stray node or a stray callback behind.
  const pulseId = useRef(0);
  const pulseTimers = useRef<number[]>([]);
  useEffect(
    () => () => {
      pulseTimers.current.forEach((handle) => window.clearTimeout(handle));
      pulseTimers.current = [];
    },
    [],
  );

  const spawnPulse = useCallback((x: number, y: number) => {
    pulseId.current += 1;
    const id = pulseId.current;
    setPulses((current) => [...current, { id, x, y }].slice(-MAX_LIVE_PULSES));
    const handle = window.setTimeout(() => {
      setPulses((current) => current.filter((pulse) => pulse.id !== id));
      pulseTimers.current = pulseTimers.current.filter((value) => value !== handle);
    }, ANSWER_PULSE_MS + 120);
    pulseTimers.current.push(handle);
  }, []);

  const handleSelect = useCallback(
    (questionId: string, optionId: string) => {
      // The answer is recorded first: the flow never depends on the decoration.
      setFlow((current) => selectAnswer(current, questionId, optionId));

      const center = optionCenter(questionId, optionId);
      if (center) {
        const questionIndex = QUIZ_QUESTIONS.findIndex((item) => item.id === questionId);
        setBlooms((current) =>
          withInkBloom(current, {
            questionId,
            x: center.x,
            y: center.y,
            tint: bloomTintFor(questionIndex),
          }),
        );
      }

      // A ripple is motion: a reduced-motion shopper gets none of it (the CSS
      // hides the layer too, so this is defence in depth).
      if (!prefersReducedMotion()) {
        const origin = freshPointerPoint(pointer.current) ?? center;
        if (origin) {
          spawnPulse(origin.x, origin.y);
        }
      }
    },
    [spawnPulse],
  );

  // The audience choice is recorded in the flow state and immediately advances
  // to Q1 — it never touches the answer selections, so scoring is untouched.
  const handleAudienceSelect = useCallback((audience: AudienceGender) => {
    setFlow((current) => selectAudience(current, audience));
  }, []);

  // Context selections live in the flow state only: they never enter the
  // answer sheet, so the personality vector and archetype stay untouched.
  const handleSeasonSelect = useCallback((season: SeasonFilter | null) => {
    setFlow((current) => selectSeason(current, season));
  }, []);

  const handleOccasionSelect = useCallback((occasion: Occasion | null) => {
    setFlow((current) => selectOccasion(current, occasion));
  }, []);

  const handleRestart = useCallback(() => {
    // A restart begins a NEW anonymous attempt: clear the once-guards so its
    // QUIZ_STARTED / QUIZ_COMPLETED events fire again (Phase 7).
    resetAnalyticsFlow();
    setResult(null);
    setNotice(null);
    setSubmitting(false);
    setPreview(null);
    setFlow(restartQuiz());

    // …and a new attempt starts on a clean page: no accumulated ink, and no
    // ripple left mid-flight with a timer still pointed at it.
    pulseTimers.current.forEach((handle) => window.clearTimeout(handle));
    pulseTimers.current = [];
    setBlooms([]);
    setPulses([]);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isQuizComplete(flow)) {
      return;
    }

    const answers = toAnswers(flow);
    setSubmitting(true);
    setNotice(null);
    setPreview(null);

    // The beats' data rides alongside the submit (local engine, no AI), so it
    // is usually already in hand when the submit resolves.
    const matchesRequest = fetchMatchesPreview(answers, flow.audience);

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
      // The beats only perform with real data: a failed preview degrades to
      // the pre-Phase-2 path instead of performing around nothing.
      const found = await matchesRequest;
      if (found) {
        setPreview(found);
        setFlow((current) => showFiltering(current));
      } else {
        setFlow((current) => showResult(current));
      }
    }
  }, [flow, storeId]);

  // The beats' timer callbacks are stable, so the countdown and interstitial
  // effects run exactly once per mount instead of resetting every render.
  const handleFilteringDone = useCallback(() => {
    setFlow((current) => showAnalysis(current));
  }, []);
  const handleAnalysisDone = useCallback(() => {
    setFlow((current) => showResult(current));
  }, []);

  // The interstitial's «رد شدن» skip: the beats are performed, never a forced
  // gate, so skipping jumps straight to /result with the selections made so
  // far (no purchase context exists yet — season/occasion serialise to
  // omission, exactly like «فرقی نمی‌کنه» in the context step).
  const handleSkipBeats = useCallback(() => {
    if (!result) {
      return;
    }
    const href = `/result?${serializeResultsParams(
      result.vector,
      result.archetype.id,
      storeId,
      undefined,
      flow.audience,
      null,
      null,
      toAnswers(flow),
    )}`;
    if (router) {
      router.push(href);
    } else if (typeof window !== "undefined") {
      // Static-render fallback only (the router always exists in the
      // browser): plain navigation keeps the skip working with no context.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(href);
    }
  }, [result, storeId, flow, router]);

  // Answered questions — the 10-question bank only. The audience step and the
  // post-result context are not questions and never move the fog.
  const answeredCount = QUIZ_QUESTIONS.filter(
    (item) => typeof flow.selections[item.id] === "string",
  ).length;

  /**
   * Every screen renders under the same three decorative layers.
   *
   * They are `fixed` and out of flow, so wrapping the screen changes no layout
   * whatsoever; it only keeps the ambience mounted for the whole run — which is
   * the point, since the ink that accumulates by Q10 is the payoff on the
   * result screen.
   */
  const withAtmosphere = (screen: ReactNode) => (
    <>
      <QuizAtmosphere
        blooms={blooms}
        pulses={pulses}
        answeredCount={answeredCount}
        totalQuestions={QUIZ_QUESTIONS.length}
      />
      {/* Act 3 — the abstract spray: ambient air of its own, ordered after the
          fog and still behind the cards. It takes no props: nothing about it is
          tied to an answer. */}
      <QuizSpray />
      {screen}
    </>
  );

  // Unboxed: the content floats directly on the ambience — no card, no
  // border, no frosted panel. Horizontal rhythm comes from the route's main
  // column (px-4 sm:px-6); each section keeps airy vertical padding only.
  // Readability over the orbs comes from the invisible reading wash (see
  // QuizAmbience), never from a surface.
  if (flow.phase === "context" && result) {
    return withAtmosphere(
      <section className="quiz-rise flex flex-col gap-6 py-4 sm:py-6">
        <ContextStep
          result={result}
          storeId={storeId}
          audience={flow.audience}
          season={flow.season}
          occasion={flow.occasion}
          onSeasonChange={handleSeasonSelect}
          onOccasionChange={handleOccasionSelect}
          onBack={() => setFlow((current) => returnToResult(current))}
        />

        <button
          type="button"
          onClick={handleRestart}
          className="mx-auto text-xs text-muted underline underline-offset-4 transition-colors hover:text-foreground"
        >
          شروع دوباره
        </button>
      </section>,
    );
  }

  // Phase 2 beats: the countdown performs the live catalog collapsing to 3,
  // the interstitial performs the analysis around the real top-3. Both render
  // only with the result AND the preview in hand; anything else falls through
  // to the pre-Phase-2 path below.
  if (flow.phase === "filtering" && result && preview) {
    return withAtmosphere(
      <FilteringCountdown
        catalogCount={preview.count}
        onDone={handleFilteringDone}
      />,
    );
  }

  if (flow.phase === "analysis" && result && preview) {
    return withAtmosphere(
      <AnalysisInterstitial
        matches={preview.matches}
        onDone={handleAnalysisDone}
        onSkip={handleSkipBeats}
      />,
    );
  }

  if (flow.phase === "result" && result) {
    return withAtmosphere(
      <QuizResultCard
        result={result}
        notice={notice}
        onRestart={handleRestart}
        storeId={storeId}
        audience={flow.audience}
        season={flow.season}
        occasion={flow.occasion}
        onContinue={() => setFlow((current) => openContext(current))}
      />,
    );
  }

  if (flow.phase === "intro") {
    return withAtmosphere(
      <section className="quiz-rise flex flex-col gap-7 py-4 sm:py-6">
        <div className="flex flex-col gap-3">
          <span className="quiz-badge-label w-fit rounded-full border border-accent/30 bg-accent-soft px-4 py-1 font-heading text-sm">
            <BrandMark className="ml-1 inline h-4 w-4" /> آزمون سلیقه عطری
          </span>
          <h1 className="font-display text-3xl font-semibold leading-[1.0] tracking-[-0.01em] text-foreground sm:text-4xl">
            {(() => {
              const highlight = splitHighlighted(
                "عطر مناسب خودتون رو پیدا کنید",
                QUESTION_HIGHLIGHTS.intro,
              );
              if (!highlight) {
                return "عطر مناسب خودتون رو پیدا کنید";
              }
              return (
                <>
                  {highlight[0]}
                  <MarkerWipe replayKey="intro">{highlight[1]}</MarkerWipe>
                  {highlight[2]}
                </>
              );
            })()}
          </h1>
          <p className="font-editorial leading-8 text-muted">
            فقط به ۱۰ سؤال کوتاه جواب بدید تا ببینیم چه رایحه‌ای بیشتر با سلیقه و
            شخصیت عطری شما هماهنگه.
          </p>
        </div>

        <span aria-hidden="true" className="h-px w-full bg-border-soft" />

        <ul className="flex flex-col gap-4 text-sm leading-8 text-muted">
          <li className="flex items-start gap-3">
            <IntroGlyph>
              <svg {...glyphProps}>
                <path d="M12 8v4l3 2" />
                <circle cx="12" cy="12" r="8" />
              </svg>
            </IntroGlyph>
            <span>کمتر از دو دقیقه وقت می‌بره.</span>
          </li>
          <li className="flex items-start gap-3">
            <IntroGlyph>
              <svg {...glyphProps}>
                <path d="M12 4v16M4 12h16" />
                <path d="M12 4 9 7M12 4l3 3M12 20l-3-3M12 20l3-3M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3" />
              </svg>
            </IntroGlyph>
            <span>
              جواب درست و غلط نداره؛ هر گزینه‌ای که بهتون نزدیک‌تره رو انتخاب کنید.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <IntroGlyph>
              <svg {...glyphProps}>
                <circle cx="11" cy="11" r="6" />
                <path d="m16 16 4 4" />
              </svg>
            </IntroGlyph>
            <span>
              نتیجه یک تحلیل سلیقه‌ای برای انتخاب عطره، نه یک تست روانشناسی.
            </span>
          </li>
        </ul>

        <button
          type="button"
          onClick={() => {
            // The shopper explicitly enters the quiz — the QUIZ_STARTED
            // moment (§6). Never fired by homepage loads or renders.
            // startQuiz() opens the audience step; Q1 follows straight after.
            trackQuizStarted(storeId);
            setFlow(startQuiz());
          }}
          className={primaryButton}
        >
          شروع آزمون
        </button>
      </section>,
    );
  }

  if (flow.phase === "audience") {
    return withAtmosphere(
      <section className="quiz-rise flex flex-col gap-6 py-4 sm:py-6">
        <AudienceStep selected={flow.audience} onSelect={handleAudienceSelect} />

        <button
          type="button"
          onClick={handleRestart}
          className="mx-auto text-xs text-muted underline underline-offset-4 transition-colors hover:text-foreground"
        >          شروع دوباره
        </button>
    </section>,
  );
}

  const question = QUIZ_QUESTIONS[flow.questionIndex];
  const progress = getProgress(flow);
  const selectedOptionId = flow.selections[question.id];
  const isLastQuestion = flow.questionIndex === QUIZ_QUESTIONS.length - 1;
  const canContinue = typeof selectedOptionId === "string";

  return withAtmosphere(
    <section className="quiz-rise flex flex-col gap-6 py-4 sm:py-6">
      <ProgressBar current={progress.current} total={progress.total} />

      <div
        className={`transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
          stepEntered ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0"
        }`}
      >
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
          // From Q1 this returns to the audience step, so it stays available.
          disabled={submitting}
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
