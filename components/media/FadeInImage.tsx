"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

/**
 * The shared one-shot image entrance (batch 45).
 *
 * The result surfaces' bottle and medallion images used to pop in when they
 * arrived. This wrapper gives all of them the approved sample's entrance —
 * opacity 0, translateY(10px), scale(.96) → final, 900ms, once — from ONE
 * implementation, so the four spots cannot drift.
 *
 * Two rules make it safe:
 *
 *  1. LOAD-GATED, NEVER TIMER-GATED. The entrance starts when the browser
 *     reports the load, not on a clock. An image that is already complete at
 *     mount (cached, or the load event fired before hydration) starts in its
 *     FINAL state and does not replay.
 *  2. FAIL-SAFE VISIBILITY. The hidden class exists only as a client-side
 *     pre-load state: the server render and the no-JS render carry no hidden
 *     class, so the image is present without JavaScript. An error resolves to
 *     the final, visible state — an image can never be left invisible because
 *     its entrance did not run.
 *
 * Under `prefers-reduced-motion` the state is settled immediately: no entrance,
 * no class. Geometry is untouched either way — the transform is visual only and
 * every host box already has fixed aspect/radius, so nothing shifts.
 */

/** The class that runs the one-shot entrance (see app/globals.css). */
export const MEDIA_FADE_IN_CLASS = "media-fade-in";

/** The client-side pre-load state; never present in server markup. */
export const MEDIA_PRELOAD_HIDDEN_CLASS = "opacity-0";

export type FadeInState = "static" | "hidden" | "animate";

/**
 * How a freshly mounted image should present itself.
 *
 * `complete` is the browser's own answer to "was this already loaded?" — a
 * cached image whose load event fired before hydration must not be hidden and
 * must not replay, so it goes straight to the final state.
 */
export function initialFadeState({
  reducedMotion,
  complete,
}: {
  reducedMotion: boolean;
  complete: boolean;
}): FadeInState {
  return reducedMotion || complete ? "static" : "hidden";
}

/** The class for a state: hidden pre-load, animate once, then nothing. */
export function fadeClassFor(state: FadeInState): string | undefined {
  if (state === "hidden") {
    return MEDIA_PRELOAD_HIDDEN_CLASS;
  }

  if (state === "animate") {
    return MEDIA_FADE_IN_CLASS;
  }

  return undefined;
}

export default function FadeInImage({
  className,
  onLoad,
  onError,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement>) {
  const imageRef = useRef<HTMLImageElement>(null);

  // SSR and the first client render both start settled (visible), so hydration
  // matches the server's markup and no-JS keeps the image.
  const [state, setState] = useState<FadeInState>("static");

  useEffect(() => {
    const image = imageRef.current;

    if (!image) {
      return;
    }

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    setState(
      initialFadeState({ reducedMotion, complete: image.complete }),
    );
  }, []);

  const fadeClass = fadeClassFor(state);

  return (
    <img
      {...rest}
      ref={imageRef}
      onLoad={(event) => {
        // Already-settled images never re-enter the animation: only the hidden
        // pre-load state can promote to the one-shot entrance.
        setState((current) => (current === "hidden" ? "animate" : current));
        onLoad?.(event);
      }}
      onError={(event) => {
        // Fail-safe: whatever happened, the image ends visible.
        setState("static");
        onError?.(event);
      }}
      className={[className, fadeClass].filter(Boolean).join(" ") || undefined}
    />
  );
}
