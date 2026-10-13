"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { archetypeEmblemImageFor } from "@/components/archetype-emblems";
import type { ArchetypeId } from "@/types/personality";

/**
 * Motion contract for the archetype reveal pop-up.
 *
 * Declared next to the component it animates — the same convention as
 * `ARCHETYPE_ICON_POP_CSS` in `components/archetype-icons.tsx` — so the
 * pop-up's motion ships with the pop-up instead of leaking into the global
 * stylesheet. Order matters: the backdrop fades in first, the panel springs in
 * after it and the emblem lands last, so the reveal reads as a short sequence
 * rather than one simultaneous fade.
 *
 * The reduced-motion bypass is written LAST on purpose: this block is emitted by
 * the component itself, after the stylesheet, so nothing later can outrank it.
 */
export const ARCHETYPE_REVEAL_CSS = `
@keyframes archetype-reveal-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes archetype-reveal-panel-pop {
  0% { opacity: 0; transform: scale(0.94) translateY(10px); }
  62% { opacity: 1; transform: scale(1.015) translateY(0); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes archetype-reveal-emblem-in {
  0% { opacity: 0; transform: scale(0.88); }
  70% { opacity: 1; transform: scale(1.02); }
  100% { opacity: 1; transform: scale(1); }
}
.archetype-reveal-backdrop { animation: archetype-reveal-backdrop-in 220ms ease-out both; }
.archetype-reveal-panel { animation: archetype-reveal-panel-pop 420ms cubic-bezier(0.22, 1, 0.36, 1) 110ms both; }
.archetype-reveal-emblem { animation: archetype-reveal-emblem-in 520ms cubic-bezier(0.22, 1, 0.36, 1) 240ms both; }
@media (prefers-reduced-motion: reduce) {
  .archetype-reveal-backdrop,
  .archetype-reveal-panel,
  .archetype-reveal-emblem { animation: none; }
}
`;

/** Focusable descendants considered by the trap (there is exactly one today). */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

interface ArchetypeRevealModalProps {
  /** The archetype whose emblem is revealed — a pure id lookup, never a score. */
  archetypeId: ArchetypeId;
  /** Persian archetype name — the modal's accessible name. */
  label: string;
  /** The selection-basis line («...همهٔ ۹ محور...»), same copy as the card. */
  selectionBasis: string;
  /**
   * Called once, when the modal closes, so the caller can hand focus back to a
   * sensible element on the screen it revealed.
   */
  onDismiss?: () => void;
}

/**
 * The dramatic archetype reveal (Phase E).
 *
 * The quiz's result phase used to open with a quiet circular seal; it now opens
 * with a centered pop-up that presents the archetype's emblem large, over a
 * dimmed backdrop, staggered in (backdrop → panel → emblem) as one reveal.
 *
 * Dismissal is always available three ways — the primary CTA «دیدن نتایج», a
 * click on the backdrop, and Escape — and the CTA is deliberately a dismissal
 * rather than a navigation: dismissing hands control back to the EXISTING flow
 * behind the pop-up (the fragrance profile card, whose own CTA opens the
 * optional refinement step and then `/result`), so no route, state machine step
 * or engine call changes here. While open the dialog is modal: focus moves
 * inside, Tab is trapped, the page behind cannot scroll, and focus returns to
 * whatever was focused before.
 *
 * Presentational only. The archetype id, label and explainer copy are passed in
 * by the caller; nothing is computed, scored or fetched.
 */
export default function ArchetypeRevealModal({
  archetypeId,
  label,
  selectionBasis,
  onDismiss,
}: ArchetypeRevealModalProps) {
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectionBasisId = useId();

  // The latest callback, held in a ref so `close` can stay stable: the modal's
  // effects depend on `close`, and an unstable parent callback must not tear the
  // focus trap down and re-run it on every render.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // One close path for all three dismissals (CTA, backdrop, Escape), so the
  // caller is notified exactly once however the pop-up is closed.
  const close = useCallback(() => {
    setOpen(false);
    onDismissRef.current?.();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    // Remember what had focus so it can be restored on close — after a
    // dismissal the shopper continues where they were, not mid-dialog.
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus lands on the primary action rather than the top of the dialog, so
    // Enter continues the flow immediately.
    const entryPoint =
      panel.querySelector<HTMLElement>("[data-reveal-autofocus]") ??
      panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      panel;
    entryPoint.focus();

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      // Trap: Tab cycles inside the dialog. With a single focusable the first
      // and last item are the same, so Tab and Shift+Tab both stay put.
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus();
    };
  }, [open, close]);

  // Dismissed: the screen behind the pop-up is the whole result again.
  if (!open) {
    return null;
  }

  return (
    <div
      className="archetype-reveal-backdrop fixed inset-0 z-[60] overflow-y-auto bg-foreground/55 backdrop-blur-sm"
      onClick={close}
    >
      {/* Motion contract — reduced-motion bypass included. */}
      <style>{ARCHETYPE_REVEAL_CSS}</style>

      {/* `min-h-full` (not `h-full`) lets this row grow past the viewport on a
          short screen, so the dialog scrolls instead of being clipped. */}
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          aria-describedby={selectionBasisId}
          // The backdrop owns dismissal; a click inside the dialog does not.
          onClick={(event) => event.stopPropagation()}
          className="archetype-reveal-panel relative flex w-full max-w-sm flex-col items-center gap-4 rounded-[2rem] border border-accent/30 bg-background px-6 py-8 text-center shadow-[var(--shadow-soft)] sm:px-8"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 -translate-y-1/3 rounded-full blur-2xl"
            style={{
              background:
                "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 28%, white), transparent)",
            }}
          />

          {/* The emblem, large. Decorative: the dialog itself carries the
              accessible name, so the picture is not announced twice. */}
          <span className="archetype-reveal-emblem relative mt-1 flex h-48 w-48 items-center justify-center rounded-full border border-accent/30 bg-surface-2 shadow-[var(--shadow-card)] sm:h-56 sm:w-56">
            <span
              aria-hidden="true"
              className="absolute inset-0 -m-3 rounded-full border border-accent/20"
            />
            <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-full">
              {/* A bundled public/ asset, not merchant data: plain <img> keeps
                  the exact file and its 1:1 ratio, with no loader in between. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={archetypeEmblemImageFor(archetypeId)}
                alt=""
                width={1600}
                height={1600}
                className="h-full w-full object-cover"
              />
            </span>
          </span>

          <h2 className="font-heading text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            {label}
          </h2>

          <span aria-hidden="true" className="h-px w-16 bg-accent/40" />

          <p id={selectionBasisId} className="max-w-xs text-xs leading-7 text-muted">
            {selectionBasis}
          </p>

          <button
            type="button"
            data-reveal-autofocus
            onClick={close}
            className="btn-primary mt-1 flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-6 font-medium text-background"
          >
            دیدن نتایج
          </button>
        </div>
      </div>
    </div>
  );
}
