"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import MarkerWipe from "@/components/quiz/MarkerWipe";
import QuizOption from "@/components/quiz/QuizOption";
import { toPersianDigits } from "@/lib/persian";
import {
  initialIllustrationStage,
  illustrationLayers,
  loadedIllustration,
  navigateIllustration,
  settledIllustration,
  failedIllustration,
  type IllustrationStage,
} from "@/lib/quiz/illustration-crossfade";
import {
  ILLUSTRATION_SIZES,
  illustrationPreloadFor,
} from "@/lib/quiz/illustration-preload";
import { questionIllustrationFor } from "@/lib/quiz/question-illustrations";
import {
  HIGHLIGHTED_QUESTION_IDS,
  QUESTION_HIGHLIGHTS,
  splitHighlighted,
} from "@/lib/personality/question-highlights";
import type { QuizQuestion } from "@/types/personality";

interface QuestionProps {
  question: QuizQuestion;
  selectedOptionId?: string;
  onSelect: (questionId: string, optionId: string) => void;
  /**
   * Opt-in editorial watermark: the question's own number, huge and faint,
   * behind the prompt. Off by default because `Question` is shared with the
   * widget, whose narrower layout keeps its existing chrome.
   */
  chapterNumeral?: boolean;
}

/**
 * `useLayoutEffect` on the client, `useEffect` on the server (where there is no
 * layout and React would only warn). The layer swap below must land before the
 * browser paints the new question, so it uses the layout variant in the app.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * One screen of the quiz: the prompt plus its answer rows.
 *
 * Phase 1 — Gilded Editorial: an asymmetric, start-aligned composition with
 * generous whitespace instead of the old centred card stack. The prompt is
 * the approved question copy — byte-identical, only its emotional core is
 * wrapped in a marker-wipe highlight on the allowlisted screens only (Q1/Q5/
 * Q10 — a signature stays rare) — set in the display face at tight leading.
 * The prompt, the option values and everything downstream (scoring,
 * matching, /result) are untouched. Above the prompt sits one full-scene
 * illustration per question, decorative and frameless.
 *
 * Batch 28 — the page-turn transition: when the question changes the outgoing
 * illustration stays exactly where it was, and the incoming one fades in over it
 * while settling from a slight scale (600ms ease). The fade is gated on the
 * incoming image's own load event, so a slow connection never shows an empty
 * stage — the old scene simply stays until the new artwork is ready — and the
 * next question's artwork is preloaded during the current one so that gate is
 * usually already satisfied. The stage box never changes: both layers are
 * absolutely positioned inside the same fixed 3:2 frame, so nothing reflows.
 * At most two layers exist (the pure machine in `illustration-crossfade`), and
 * the first mount has no outgoing scene, so nothing animates on arrival. Under
 * `prefers-reduced-motion` the swap is instant and single-layered.
 *
 * This is a one-shot transition on change, never a loop, so it does not touch
 * the coarse-pointer ambience budget.
 *
 * `chapterNumeral` adds the quiz-only chapter watermark behind the prompt. It is
 * aria-hidden and absolutely positioned, so it changes no layout — and it is
 * opt-in, because the widget renders this same screen at 480px.
 */
export default function Question({
  question,
  selectedOptionId,
  onSelect,
  chapterNumeral = false,
}: QuestionProps) {
  const highlight = HIGHLIGHTED_QUESTION_IDS.has(question.id)
    ? splitHighlighted(question.prompt, QUESTION_HIGHLIGHTS[question.id])
    : null;
  const illustration = questionIllustrationFor(question.id);

  const [stage, setStage] = useState<IllustrationStage>(() =>
    initialIllustrationStage(question.id),
  );
  // Read at event time and kept live, never during render: the server has no
  // motion preference and must not disagree with the first client paint.
  const reducedMotion = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = query.matches;
    const sync = () => {
      reducedMotion.current = query.matches;
    };

    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Arriving on a new question happens before paint, so the prompt and its
  // artwork change together rather than the artwork lagging a frame behind.
  useIsomorphicLayoutEffect(() => {
    setStage((current) =>
      navigateIllustration(current, question.id, {
        reducedMotion: reducedMotion.current,
      }),
    );
  }, [question.id]);

  // Warm the next screen's artwork while this one is being read. The order is
  // static, the widget renders this same component over the same bank, and the
  // last question has no successor.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const next = illustrationPreloadFor(question.id);
    if (!next) {
      return;
    }

    const image = new window.Image();
    image.decoding = "async";
    if (next.srcSet) {
      image.srcset = next.srcSet;
    }
    image.sizes = next.sizes;
    image.src = next.src;
  }, [question.id]);

  const handleLoad = useCallback((id: string) => {
    setStage((current) =>
      loadedIllustration(current, id, { reducedMotion: reducedMotion.current }),
    );
  }, []);

  const handleFail = useCallback((id: string) => {
    setStage((current) => failedIllustration(current, id));
  }, []);

  const handleSettle = useCallback((id: string) => {
    setStage((current) => settledIllustration(current, id));
  }, []);

  const layerIds = illustration ? illustrationLayers(stage) : [];

  return (
    <div className="flex flex-col gap-8 py-2 sm:gap-10 sm:py-4">
      <span aria-hidden="true" className="h-px w-12 bg-accent/50" />
      {/* Illustration stage: one full-scene editorial drawing per question
          screen, above the question text. Decorative (the prompt carries the
          meaning), so every layer is alt="" and the stage is hidden from
          assistive tech — the current layer is the only one that is not a
          duplicate of an outgoing scene.

          The stage is sized by the artwork's own 3:2 ratio at full column
          width — capped and centred on wide screens — so the whole approved
          scene is shown, never cropped and never focus-framed. One ratio for all
          ten scenes keeps the height identical on every question. Each scene is
          opaque and carries its own background, so it fills the stage with
          clipped overflow and the site's small media radius — edge to edge, with
          no frame, border or shadow.

          On a question change the outgoing layer is kept mounted underneath
          (bottom of the stack) while the incoming one fades in on top of it: two
          layers at most, both out of flow inside this fixed box. */}
      {illustration ? (
        <div
          aria-hidden="true"
          className="quiz-illustration relative aspect-[3/2] w-full overflow-hidden rounded-2xl sm:mx-auto sm:max-w-[640px]"
        >
          {layerIds.map((layerId) => {
            const isCurrent = layerId === stage.current;
            const src = isCurrent
              ? illustration
              : questionIllustrationFor(layerId);
            if (!src) {
              return null;
            }

            // The incoming scene waits invisible while it downloads, but only
            // when there is something underneath it to keep the stage full: on
            // a first mount there is no outgoing scene, so it shows immediately.
            const pending =
              isCurrent &&
              stage.outgoing !== null &&
              stage.loaded !== layerId &&
              !stage.fading;
            const layerClass = [
              "quiz-illustration-layer",
              isCurrent && stage.fading
                ? "quiz-illustration-layer--swap"
                : "",
              pending ? "quiz-illustration-layer--pending" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={layerId}
                data-illustration-layer={isCurrent ? "current" : "outgoing"}
                aria-hidden={isCurrent ? undefined : "true"}
                className={layerClass}
                onAnimationEnd={
                  isCurrent ? () => handleSettle(layerId) : undefined
                }
              >
                <Image
                  src={src}
                  alt=""
                  aria-hidden="true"
                  fill
                  sizes={ILLUSTRATION_SIZES}
                  className="object-cover object-center"
                  onLoad={
                    isCurrent ? () => handleLoad(layerId) : undefined
                  }
                  onError={isCurrent ? () => handleFail(layerId) : undefined}
                />
              </div>
            );
          })}
        </div>
      ) : null}
      {/* The 48px title-to-options room lives on the legend's margin, not on
          the fieldset's gap: a rendered <legend> is laid out specially and
          flex gap never reaches it (measured 0px in Chrome), while
          margin-bottom lands exactly. */}
      <fieldset className="relative isolate flex min-w-0 flex-col gap-6">
        <legend className="mb-12 flex flex-col gap-3 p-0">
          <span className="quiz-editorial-kicker">
            سؤال {toPersianDigits(question.order)}
          </span>
          <span className="font-display text-[1.7rem] font-semibold leading-[1.0] tracking-[-0.01em] text-foreground sm:text-4xl">
            {highlight ? (
              <>
                {highlight[0]}
                <MarkerWipe replayKey={question.id}>
                  {highlight[1]}
                </MarkerWipe>
                {highlight[2]}
              </>
            ) : (
              question.prompt
            )}
          </span>
        </legend>
        {/* Out of flow and behind the words: the watermark is the same number
            the kicker already gives, so it never carries anything on its own. */}
        {chapterNumeral ? (
          <span aria-hidden="true" className="quiz-chapter-numeral">
            {toPersianDigits(question.order)}
          </span>
        ) : null}
        <div className="flex flex-col gap-3">
          {question.options.map((option, optionIndex) => (
            <QuizOption
              key={option.id}
              name={question.id}
              optionId={option.id}
              label={option.label}
              index={optionIndex}
              selected={selectedOptionId === option.id}
              onSelect={(optionId) => onSelect(question.id, optionId)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
