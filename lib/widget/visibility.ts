/**
 * WIDGET_VIEWED — when does a widget actually count as seen?
 *
 * The funnel's first step used to mean "the iframe mounted", but the loader
 * injects the iframe on page load, which is true even when the widget sits
 * below the fold or in a background tab. The merchant's «بازدید ویجت» then
 * counts loads and can never match their own analytics.
 *
 * The contract now has two honest cases:
 *
 *  - TOP-LEVEL (`window === window.top`, e.g. someone opening /widget directly):
 *    the widget IS the page, so it fires once the store config resolves —
 *    exactly as before.
 *  - EMBEDDED: mounting proves nothing. The loader observes the mount point and
 *    posts `{ type: "fiage-widget:visible", storeId }` the first time any part
 *    of it enters the merchant page's viewport; the widget fires WIDGET_VIEWED
 *    only for a message that names its own store, and only once.
 *
 * The decisions live here, pure and DOM-free, so they are testable without a
 * browser and so the loader's literal and the widget's listener can never drift
 * apart. Fire-once discipline still belongs to the tracker
 * (`lib/analytics/flow-tracker.ts`); these helpers only decide whether a signal
 * qualifies.
 */

/** The loader → widget message that means "now actually on screen". */
export const WIDGET_VISIBLE_MESSAGE = "fiage-widget:visible";

/** The minimal window shape needed to tell an embed from a top-level visit. */
export interface WidgetWindowLike {
  readonly top: unknown;
}

/**
 * True when the widget runs inside an iframe. A top-level visit (or an
 * environment without a window, such as SSR) is not embedded.
 */
export function isEmbeddedWidget(win: WidgetWindowLike | null | undefined): boolean {
  if (!win) {
    return false;
  }

  try {
    return win !== win.top;
  } catch {
    // A cross-origin access that cannot be compared: treat as top-level so the
    // event still fires (the old behaviour) instead of silently disappearing.
    return false;
  }
}

/** Mount alone is enough only when the widget is the whole page. */
export function shouldFireWidgetViewedOnMount(embedded: boolean): boolean {
  return !embedded;
}

/**
 * A visibility message qualifies only when it carries the right type AND this
 * widget's own store id — a parent page (or a sibling embed) must not be able
 * to attribute a view to another store.
 */
export function isWidgetVisibleMessage(data: unknown, storeId: string): boolean {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const message = data as Record<string, unknown>;

  return message.type === WIDGET_VISIBLE_MESSAGE && message.storeId === storeId;
}

/** Whether a received message should fire the event (never twice). */
export function shouldFireFromMessage(
  data: unknown,
  storeId: string,
  alreadyFired: boolean,
): boolean {
  return !alreadyFired && isWidgetVisibleMessage(data, storeId);
}
