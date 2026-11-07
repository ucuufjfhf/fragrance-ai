"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { isEmbeddedWidget, type WidgetWindowLike } from "@/lib/widget/visibility";

/**
 * FIAGE chrome for the widget — shown ONLY when the widget is the page.
 *
 * The same route serves two very different audiences:
 *
 *  - TOP-LEVEL (`fiage.ir/widget?store=…`, the demo link a merchant opens):
 *    the widget IS the page, so it needs a brand frame — a quiet masthead and a
 *    footer that says who runs the quiz and where the data policy lives.
 *  - EMBEDDED (inside a merchant's iframe): the merchant's page already has its
 *    own chrome. Anything of ours here competes with their brand, so this
 *    renders NOTHING — no DOM, and therefore no height.
 *
 * The decision is made at mount, from the same pure helper the WIDGET_VIEWED
 * split uses (`isEmbeddedWidget`), and not at render time: server markup and
 * first paint are identical in both modes (null), so an embed can never flash a
 * FIAGE header before hiding it — and the embedded page's measured height, which
 * the resize bridge reports to the parent, is untouched.
 *
 * Chrome is deliberately quiet and brand-token only: the store's accent colour
 * stays the widget's, never this frame's.
 */

/**
 * Whether the chrome belongs on this render: only for a decided, top-level
 * window. `null`/`undefined` (SSR, and the pre-effect first render) is not a
 * decision yet, so it never renders chrome.
 */
export function shouldRenderWidgetChrome(
  win: WidgetWindowLike | null | undefined,
): boolean {
  if (!win) {
    return false;
  }

  return !isEmbeddedWidget(win);
}

/** Mount-time mode decision. Starts undecided, so the first render is null. */
function useStandaloneChrome(): boolean {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(shouldRenderWidgetChrome(window));
  }, []);

  return standalone;
}

/** The masthead: the FIAGE mark plus the wordmark as typography. */
export function WidgetChromeHeader() {
  const standalone = useStandaloneChrome();

  if (!standalone) {
    return null;
  }

  return (
    <header className="flex items-center justify-center gap-2.5 border-b border-border-soft pb-4 text-foreground">
      <Image
        src="/brand/fiage-mark.png"
        alt="FIAGE"
        width={560}
        height={560}
        className="h-9 w-9 shrink-0 object-contain"
      />
      {/* Letterspaced display type, echoing the main site's header lockup. The
          negative inline-end margin cancels the tracking's trailing gap. */}
      <span className="me-[-0.3em] font-display text-base tracking-[0.3em]">
        FIAGE
      </span>
    </header>
  );
}

/**
 * The footer: who runs this quiz, and the two public links. `mt-auto` rests it
 * at the bottom of the min-h-dvh column, so a top-level visit fills the
 * viewport instead of floating a card at the top of an empty page.
 */
export function WidgetChromeFooter() {
  const standalone = useStandaloneChrome();

  if (!standalone) {
    return null;
  }

  return (
    <footer className="mt-auto border-t border-border-soft pt-4 text-center text-xs text-muted">
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>این آزمون توسط FIAGE ارائه می‌شه</span>
        <a
          href="https://fiage.ir"
          className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          fiage.ir
        </a>
        <a
          href="https://fiage.ir/data-policy"
          className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          حریم داده‌ها
        </a>
      </p>
    </footer>
  );
}
