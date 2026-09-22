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
 *   5. sizes the iframe from postMessage resize events emitted by the page.
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
  iframe.src = baseUrl + "/widget?store=" + encodeURIComponent(storeId);
  iframe.title = "عطر خودتو پیدا کن";
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

  // --- auto-resize from the widget page's postMessage bridge (§8) ---
  window.addEventListener("message", function (event) {
    if (event.origin !== baseUrl || !event.data || event.data.type !== "fragrance-ai:resize") {
      return;
    }

    var height = Number(event.data.height);

    if (Number.isFinite(height) && height > 0) {
      iframe.style.height = Math.ceil(height) + "px";
    }
  });
})();
