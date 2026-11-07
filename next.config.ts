import type { NextConfig } from "next";

/**
 * Security headers, scoped to the one route that must stay framable.
 *
 * `/store-report/<token>` is a bearer-capability page: whoever holds the link
 * sees that store's aggregate report, so it must never be framed by another
 * site. The same goes for `/admin/*` and every public page.
 *
 * `/widget` is the exception, because framing IS the product: merchants mount
 * it in an iframe on their own origin, so it keeps `frame-ancestors *` and no
 * `X-Frame-Options` (that header has no "allow everyone" value and would
 * defeat the embed).
 *
 * Deliberate limits of this change:
 *  - the CSP carries ONLY `frame-ancestors` — no script-src/style-src. A full
 *    policy is a separate, riskier change; a partial one here would be a false
 *    sense of protection.
 *  - HSTS and X-Content-Type-Options are left to the platform (Netlify sends
 *    both today) rather than duplicated here.
 *  - `/widget.js` gets a one-hour public cache so merchants' pages revalidate
 *    the loader hourly instead of on every visit. Whether a public/ asset is
 *    served by the runtime or ahead of it is a hosting detail: the rule ships
 *    either way, and the built-server check records what actually happened.
 */

const REFERRER_POLICY = "strict-origin-when-cross-origin";
const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()";

/** The deny-everywhere rule, minus `/widget` (and `/widget/…`). */
const NON_WIDGET_PATHS = "/:path((?!widget(?:$|/)).*)";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Everything except the widget: no framing, from anyone.
        source: NON_WIDGET_PATHS,
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: REFERRER_POLICY },
          { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
        ],
      },
      {
        // The embeddable widget: any merchant origin may frame it.
        source: "/widget",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "Referrer-Policy", value: REFERRER_POLICY },
          { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
        ],
      },
      {
        // The loader merchants paste; one hour is enough to refresh a fix.
        source: "/widget.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
};

export default nextConfig;
