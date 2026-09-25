import type { Metadata } from "next";

import WidgetApp from "@/components/widget/WidgetApp";

/**
 * GET /widget — the iframe document served on the app's own origin (Phase 8).
 *
 * This is the actual embeddable experience: a merchant page loads a tiny
 * loader script, which mounts an iframe pointed at this route
 * (`/widget?store=…`). The iframe gives **complete two-way CSS isolation**
 * from the merchant page (§8) while reusing the app's real quiz components —
 * there is exactly one quiz UI, one scorer and one matching engine.
 *
 * All traffic inside the iframe is same-origin to the app; only the two
 * public widget APIs are additionally exposed cross-origin for direct
 * integrations. The iframe is resized via postMessage by the app below.
 */

export const metadata: Metadata = {
  title: "عطر خودتو پیدا کن",
  robots: { index: false, follow: false },
};

interface WidgetPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WidgetPage({ searchParams }: WidgetPageProps) {
  const params = await searchParams;
  const rawStore = params.store;
  const storeId = (Array.isArray(rawStore) ? rawStore[0] : rawStore) ?? "";

  return (
    <main
      dir="rtl"
      lang="fa"
      className="flex min-h-dvh w-full flex-col bg-background p-4"
      data-widget-root=""
    >
      <WidgetApp storeId={storeId} />
      <WidgetResizeBridge />
    </main>
  );
}

/**
 * Client bridge that reports the iframe's content height to the parent page
 * (postMessage) so the loader can size the frame without scrollbars.
 */
function WidgetResizeBridge() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function () {
  var last = 0;
  function send() {
    var h = document.documentElement.scrollHeight;
    if (h !== last && window.parent !== window) {
      last = h;
      window.parent.postMessage({ type: "fragrance-ai:resize", height: h }, "*");
    }
  }
  new ResizeObserver(send).observe(document.body);
  window.addEventListener("load", send);
  setInterval(send, 800);
})();
`,
      }}
    />
  );
}
