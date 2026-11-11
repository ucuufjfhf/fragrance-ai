import { describe, expect, it } from "vitest";

import { parseResultsParams, serializeResultsParams } from "@/lib/results/params";
import { makeVector } from "@/tests/ai/fixtures";

/**
 * Batch 43 — the optional `?session=` attempt token on the results URL.
 *
 * The token is the same opaque id the attempt's QUIZ_STARTED/QUIZ_COMPLETED
 * events carried. The URL is the only way /result can learn it (the page is
 * stateless), so the contract under test is: valid tokens round-trip exactly,
 * and anything else degrades to "no session" without ever failing a render.
 */

const TOKEN = "s-1737500000000-abc123";
const MAX_TOKEN = "a".repeat(64);

const searchOf = (query: string): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(query).entries());

const base = (): Record<string, string> =>
  searchOf(serializeResultsParams(makeVector(), "romantic"));

describe("results params — attempt session token", () => {
  it("round-trips the token through serialize → parse, unchanged", () => {
    const query = serializeResultsParams(
      makeVector(),
      "romantic",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      TOKEN,
    );

    expect(new URLSearchParams(query).get("session")).toBe(TOKEN);

    const parsed = parseResultsParams(searchOf(query));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.sessionId).toBe(TOKEN);
  });

  it("omits the param entirely without a token (legacy URL byte-identical)", () => {
    const query = serializeResultsParams(makeVector(), "romantic");

    expect(query).not.toContain("session");

    const parsed = parseResultsParams(searchOf(query));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.sessionId).toBeNull();
  });

  it("never writes a malformed token into a URL", () => {
    for (const bad of ["", "   ", "bad id!", "a".repeat(65), "٤٥٦"]) {
      const query = serializeResultsParams(
        makeVector(),
        "romantic",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        bad,
      );

      expect(new URLSearchParams(query).get("session")).toBeNull();
    }
  });

  it("parses absent, empty, malformed and oversized values to no session, never an error", () => {
    for (const bad of [undefined, "", "   ", "bad id!", "a".repeat(65), "٤٥٦", "../../etc"]) {
      const input = bad === undefined ? base() : { ...base(), session: bad };
      const parsed = parseResultsParams(input);

      // The analytics param must never break, redirect or error a render.
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.sessionId).toBeNull();
      // Everything else still parsed as before.
      expect(parsed.value.archetype.id).toBe("romantic");
    }
  });

  it("accepts the 64-char boundary and trims surrounding whitespace", () => {
    const parsed = parseResultsParams({ ...base(), session: `  ${MAX_TOKEN}  ` });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.sessionId).toBe(MAX_TOKEN);
  });

  it("keeps an over-long token out of both directions", () => {
    const oversized = "a".repeat(65);

    const parsed = parseResultsParams({ ...base(), session: oversized });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.sessionId).toBeNull();
  });
});
