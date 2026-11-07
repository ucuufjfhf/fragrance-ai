"use client";

import { useEffect, useRef } from "react";

import { WIDGET_LOADER_ATTRIBUTES } from "@/lib/for-stores/content";

/**
 * The live widget demo on /for-stores — the merchant's install line, injected
 * after hydration instead of server-rendered.
 *
 * Why it cannot be a plain `<script src="/widget.js" …>` in the server markup:
 * the loader runs during parse and inserts its mount `<div>` + iframe next to
 * its own script element. That happens BEFORE React hydrates the page, so the
 * server-rendered container holds children React does not know about; hydration
 * reconciles it back to its own children and the mount (with the iframe, whose
 * request is then aborted) disappears. Verified in the browser: the loader's
 * once-guard was set while zero iframes remained in the DOM.
 *
 * Injecting the identical tag after mount keeps React the only owner of the
 * DOM: the loader still runs exactly as it does on a merchant's page, with the
 * shipped `/widget.js` and the same `data-store-id`, on this same origin — the
 * merchant's line simply arrives from the client instead of the parser. The
 * loader's own duplicate guard makes a second injection a no-op.
 *
 * The script is never removed on unmount: it is a one-shot global (removing it
 * would abort an in-flight journey), and the container is what unmounts with
 * the page anyway.
 */
export default function WidgetDemoEmbed() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    // Fast refresh / a repeated effect run must never add a second copy.
    if (host.querySelector('script[src*="widget.js"]')) {
      return;
    }

    const script = document.createElement("script");

    for (const [name, value] of Object.entries(WIDGET_LOADER_ATTRIBUTES)) {
      script.setAttribute(name, value);
    }

    host.appendChild(script);
  }, []);

  // A BLOCK host, not a centred flex row: the loader's mount div is a plain
  // block whose iframe declares `width: 100%`, but as a flex item it would
  // shrink-wrap to the iframe's intrinsic 300px and the widget would arrive at
  // 300px on every screen. As a block child it fills the column, and the
  // loader's own `max-width: 480px` still caps it.
  return <div ref={hostRef} data-widget-demo-host="" className="block w-full" />;
}
