/**
 * Fragrance AI — embeddable widget loader (Phase 8).
 *
 * Merchant installation (copy/paste, no npm):
 *
 *   <script src="https://YOUR-DOMAIN/widget.js" data-store-id="STORE_ID"></script>
 *
 * What it does:
 *   1. locates its own <script> element (currentScript, with a safe fallback
 *      for async injection);
 *   2. reads + validates `data-store-id`;
 *   3. guards against duplicate initialization (extra copies are no-ops);
 *   4. creates a mount point and an iframe pointed at this deployment's
 *      /widget?store=… route (same origin as this script file);
 *   5. sizes the iframe from postMessage resize events emitted by its own
 *      iframe, within sane bounds — and replaces the frame with a small
 *      fallback if that frame never loads at all;
 *   6. tells the widget when the mount is actually visible (WIDGET_VIEWED),
 *      so an impression is a view and not merely a page load.
 *
 * The iframe is the CSS isolation boundary (§8): complete two-way isolation
 * with zero dependencies, while the app inside reuses the one real quiz UI,
 * scorer and matching engine. The loader ships no app code.
 *
 * The widget URL is derived from the loader's own src (documented, no build
 * step needed), overridable via data-base-url for reverse-proxy setups.
 */
(function () {
  "use strict";

  var WIDGET_ID = "fragrance-ai-widget";
  var IFRAME_ID = WIDGET_ID + "-frame";
  var ORIGIN_MARKER = WIDGET_ID + ":loaded";

  // Resize bounds: a postMessage height is a hint from another document, never
  // an instruction. Values outside this range are ignored, not clamped.
  var MIN_HEIGHT = 200;
  var MAX_HEIGHT = 5000;

  // How long the iframe may stay silent before the loader replaces it.
  var LOAD_TIMEOUT_MS = 12000;

  // --- duplicate-initialization guard (§23) ---
  if (window[ORIGIN_MARKER]) {
    return;
  }
  window[ORIGIN_MARKER] = true;

  function fail(message) {
    if (window.console && window.console.warn) {
      window.console.warn("[fragrance-ai] " + message);
    }
  }

  // --- locate our own <script> (currentScript; query fallback for async) ---
  var script =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");

      for (var index = scripts.length - 1; index >= 0; index -= 1) {
        var candidate = scripts[index];

        if (candidate.src && candidate.src.indexOf("/widget.js") !== -1) {
          return candidate;
        }
      }

      return null;
    })();

  if (!script) {
    fail("loader script tag not found.");
    return;
  }

  // --- read + validate the embed configuration (§9/§10) ---
  var storeId = script.getAttribute("data-store-id");

  if (!storeId || !/^[a-zA-Z0-9_-]{1,64}$/.test(storeId)) {
    fail("missing or invalid data-store-id — the widget was not mounted.");
    return;
  }

  // --- resolve the app base URL: explicit override or the script's origin ---
  var baseUrl = script.getAttribute("data-base-url");

  if (!baseUrl) {
    try {
      var scriptUrl = new URL(script.src);

      baseUrl = scriptUrl.origin;
    } catch (error) {
      void error;
      fail("cannot derive the widget URL from the script src.");
      return;
    }
  }

  // --- create the mount point + isolated iframe ---
  var mount = document.createElement("div");

  mount.id = WIDGET_ID;
  script.parentNode.insertBefore(mount, script.nextSibling);

  var iframe = document.createElement("iframe");

  iframe.id = IFRAME_ID;
  var widgetUrl = baseUrl + "/widget?store=" + encodeURIComponent(storeId);

  iframe.src = widgetUrl;
  iframe.title = "عطر خودتون رو پیدا کنید";
  iframe.setAttribute("allow", "clipboard-write");
  iframe.style.border = "0";
  iframe.style.width = "100%";
  iframe.style.maxWidth = "480px";
  iframe.style.minHeight = "320px";
  iframe.style.height = "560px";
  iframe.style.colorScheme = "light";
  iframe.style.background = "transparent";
  iframe.setAttribute("scrolling", "no");

  mount.appendChild(iframe);

  // --- "actually seen" signal (WIDGET_VIEWED) ---
  // Injecting the iframe says nothing about whether a shopper ever saw it: it
  // may be below the fold, in a background tab, or on a pre-rendered page. So
  // observe the mount point and tell the widget the FIRST time any part of it
  // enters the merchant page's viewport, then stop observing. Delivery waits
  // for the iframe's load event (a message sent to a document that is not ready
  // yet is lost) and is attempted at most once. Without IntersectionObserver —
  // or if it throws — the signal goes out on load, i.e. today's fire-on-mount
  // behaviour as the floor. Nothing here may throw and break an embed.
  var visible = false;
  var delivered = false;
  var loaded = false;

  function deliverVisible() {
    if (!visible || !loaded || delivered) {
      return;
    }

    delivered = true;

    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: "fiage-widget:visible", storeId: storeId },
          baseUrl
        );
      }
    } catch (error) {
      void error;
    }
  }

  // --- down-state watchdog ---
  // If the app deployment is unreachable, the iframe is a fixed-height hole on
  // the merchant's page showing the browser's own error page — which reads as
  // the merchant's breakage, not ours. So if no load event arrives within
  // LOAD_TIMEOUT_MS, the loader replaces the mount's content with a small
  // fallback it renders itself: inline styles only, so it neither depends on
  // nor leaks into the host page's CSS. The first load cancels it permanently.
  var watchdog = null;

  function clearWatchdog() {
    if (watchdog !== null) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  }

  function showFallback() {
    if (loaded) {
      return;
    }

    var fallback = document.createElement("div");

    fallback.dir = "rtl";
    fallback.style.boxSizing = "border-box";
    fallback.style.maxWidth = "480px";
    fallback.style.padding = "24px 16px";
    fallback.style.border = "1px solid #e5e7eb";
    fallback.style.borderRadius = "16px";
    fallback.style.background = "#ffffff";
    fallback.style.color = "#4b5563";
    fallback.style.fontFamily = "sans-serif";
    fallback.style.fontSize = "14px";
    fallback.style.lineHeight = "2";
    fallback.style.textAlign = "center";

    var message = document.createElement("p");

    message.style.margin = "0 0 8px";
    message.textContent = "آزمون عطر فیاژ در دسترس نیست";

    var retry = document.createElement("a");

    retry.href = widgetUrl;
    retry.target = "_blank";
    retry.rel = "noopener";
    retry.textContent = "تلاش دوباره";
    retry.style.color = "#7c3aed";
    retry.style.textDecoration = "underline";

    fallback.appendChild(message);
    fallback.appendChild(retry);

    mount.textContent = "";
    mount.appendChild(fallback);
  }

  if (typeof setTimeout === "function") {
    watchdog = setTimeout(showFallback, LOAD_TIMEOUT_MS);
  }

  iframe.addEventListener("load", function () {
    clearWatchdog();
    loaded = true;
    deliverVisible();
  });

  try {
    if (typeof IntersectionObserver === "function") {
      var observer = new IntersectionObserver(function (entries) {
        for (var index = 0; index < entries.length; index += 1) {
          if (entries[index].isIntersecting) {
            observer.disconnect();
            visible = true;
            deliverVisible();
            return;
          }
        }
      });

      observer.observe(mount);
    } else {
      visible = true;
    }
  } catch (error) {
    void error;
    visible = true;
  }

  // --- auto-resize from the widget page's postMessage bridge (§8) ---
  // The origin and the message type are public knowledge, so another fiage.ir
  // frame on the same merchant page could otherwise resize this mount to 1px
  // (or 100000px). Identity is the one thing it cannot fake: only THIS
  // loader's own iframe may move this loader's frame.
  window.addEventListener("message", function (event) {
    if (
      event.origin !== baseUrl ||
      event.source !== iframe.contentWindow ||
      !event.data ||
      event.data.type !== "fragrance-ai:resize"
    ) {
      return;
    }

    var height = Number(event.data.height);

    if (!Number.isFinite(height) || height < MIN_HEIGHT || height > MAX_HEIGHT) {
      return;
    }

    iframe.style.height = Math.ceil(height) + "px";
  });
})();
