import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

/**
 * The security-header contract, asserted against the real config.
 *
 * Why a config test rather than only a request test: `headers()` is compiled
 * into the route manifest at build time, so a rule that silently stops
 * covering a route (a changed `source`, a header dropped from an array) would
 * otherwise only show up in production. The built-server checks live in the
 * batch report; this pins the rules themselves.
 *
 * The framing split is the whole point:
 *  - `/store-report/<token>` is a bearer capability and `/admin/*` is gated, so
 *    neither may be framed by another site;
 *  - `/widget` IS an iframe product — it must keep `frame-ancestors *` and must
 *    never carry `X-Frame-Options`, which has no "allow any origin" value.
 */

type Rule = { source: string; headers: Array<{ key: string; value: string }> };

async function rules(): Promise<Rule[]> {
  const headers = nextConfig.headers;
  expect(headers, "next.config.ts must define headers()").toBeTypeOf("function");

  return (await headers!()) as Rule[];
}

function valueOf(rule: Rule, key: string): string | undefined {
  return rule.headers.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value;
}

describe("next.config security headers", () => {
  it("denies framing everywhere except the widget", async () => {
    const all = await rules();
    const denyRule = all.find((rule) => valueOf(rule, "X-Frame-Options") === "DENY");

    expect(denyRule, "a DENY rule must exist").toBeDefined();
    expect(valueOf(denyRule!, "Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(valueOf(denyRule!, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(valueOf(denyRule!, "Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
    // The catch-all must exclude /widget, or the embed would be blocked.
    expect(denyRule!.source).toContain("widget");
    expect(denyRule!.source).toContain("?!");
  });

  it("keeps /widget framable by any merchant origin, with no X-Frame-Options", async () => {
    const all = await rules();
    const widgetRule = all.find((rule) => rule.source === "/widget");

    expect(widgetRule, "an explicit /widget rule must exist").toBeDefined();
    expect(valueOf(widgetRule!, "X-Frame-Options")).toBeUndefined();
    expect(valueOf(widgetRule!, "Content-Security-Policy")).toBe("frame-ancestors *");
    expect(valueOf(widgetRule!, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(valueOf(widgetRule!, "Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("carries only frame-ancestors in the CSP — no half-built policy", async () => {
    for (const rule of await rules()) {
      const csp = valueOf(rule, "Content-Security-Policy");

      if (csp === undefined) {
        continue;
      }

      expect(csp.startsWith("frame-ancestors ")).toBe(true);
      // One directive and nothing else this batch.
      expect(csp).not.toContain(";");
      for (const directive of ["script-src", "style-src", "img-src", "default-src", "connect-src"]) {
        expect(csp).not.toContain(directive);
      }
    }
  });

  it("caches the merchant loader for an hour", async () => {
    const all = await rules();
    const loaderRule = all.find((rule) => rule.source === "/widget.js");

    expect(loaderRule, "a /widget.js rule must exist").toBeDefined();
    expect(valueOf(loaderRule!, "Cache-Control")).toBe("public, max-age=3600");
  });

  it("leaves platform-provided headers alone", async () => {
    const all = await rules();
    const keys = all.flatMap((rule) => rule.headers.map((header) => header.key.toLowerCase()));

    expect(keys).not.toContain("strict-transport-security");
    expect(keys).not.toContain("x-content-type-options");
  });
});
