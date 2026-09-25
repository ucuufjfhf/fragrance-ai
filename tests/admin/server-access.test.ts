import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_ACCESS_COOKIE,
  adminAccessCookieValue,
} from "@/lib/admin/access";
import {
  isAdminAuthenticated,
  requireAdmin,
  requireAdminAction,
} from "@/lib/admin/server-access";

/**
 * Tests for the server-side admin gate (`lib/admin/server-access.ts`), the
 * Node-runtime successor of the removed `proxy.ts` network boundary.
 *
 * The Next.js server plumbing (`cookies()`, `redirect()`) is mocked at the
 * module boundary — exactly how the app consumes it — so the tests verify the
 * REAL decision logic (`isAdminRequestAuthorized` over the real helpers) plus
 * the guard behavior, without a DB, network or renderer. Node environment,
 * mirroring `tests/admin/access.test.ts` conventions.
 */

const SECRET = "correct horse battery staple";
const OTHER_SECRET = "a completely different secret";

/** The mutable fake for `next/headers` cookies(). */
let cookieJar: Map<string, string>;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  })),
}));

/** Captures the redirect target thrown by `next/navigation`'s redirect(). */
let redirectTarget: string | null = null;

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string): never => {
    redirectTarget = url;
    // Mirror Next.js control flow: redirect() throws to unwind the render.
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

async function unlockWith(secret: string): Promise<void> {
  cookieJar.set(ADMIN_ACCESS_COOKIE, await adminAccessCookieValue(secret));
}

beforeEach(() => {
  cookieJar = new Map();
  redirectTarget = null;
  vi.stubEnv("ADMIN_ACCESS_SECRET", SECRET);
});

describe("isAdminAuthenticated (the server-side gate decision)", () => {
  it("denies when the secret env var is missing", async () => {
    vi.stubEnv("ADMIN_ACCESS_SECRET", "");
    await unlockWith(SECRET);
    expect(await isAdminAuthenticated()).toBe(false);
  });

  it("denies when the secret env var is empty", async () => {
    delete process.env.ADMIN_ACCESS_SECRET;
    await unlockWith(SECRET);
    expect(await isAdminAuthenticated()).toBe(false);
  });

  it("denies when the cookie is missing", async () => {
    expect(await isAdminAuthenticated()).toBe(false);
  });

  it("denies an invalid cookie value", async () => {
    cookieJar.set(ADMIN_ACCESS_COOKIE, "not-a-valid-hash");
    expect(await isAdminAuthenticated()).toBe(false);
  });

  it("denies a cookie minted from a DIFFERENT secret (rotation invalidates)", async () => {
    await unlockWith(OTHER_SECRET);
    expect(await isAdminAuthenticated()).toBe(false);
  });

  it("accepts a cookie carrying the current secret's hash", async () => {
    await unlockWith(SECRET);
    expect(await isAdminAuthenticated()).toBe(true);
  });
});

describe("requireAdmin (the page guard)", () => {
  it("redirects unauthenticated requests to the gate page", async () => {
    await expect(requireAdmin("/admin/perfumes")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirectTarget).toBe("/admin/access?next=%2Fadmin%2Fperfumes");
  });

  it("preserves the SAFE requested admin path in the redirect", async () => {
    await expect(
      requireAdmin("/admin/perfumes/abc/edit?store=store-1"),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectTarget).toBe(
      `/admin/access?next=${encodeURIComponent("/admin/perfumes/abc/edit?store=store-1")}`,
    );
  });

  it("falls back to the admin home for a non-admin-relative path (open-redirect guard)", async () => {
    await expect(requireAdmin("https://evil.example")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirectTarget).toBe("/admin/access?next=%2Fadmin%2Fperfumes");
  });

  it("falls back to the admin home when no next path is given", async () => {
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectTarget).toBe("/admin/access?next=%2Fadmin%2Fperfumes");
  });

  it("returns normally when authenticated (no redirect)", async () => {
    await unlockWith(SECRET);
    await expect(requireAdmin("/admin/perfumes")).resolves.toBeUndefined();
    expect(redirectTarget).toBeNull();
  });
});

describe("requireAdminAction (the action guard)", () => {
  it("redirects unauthenticated callers to the gate page", async () => {
    await expect(requireAdminAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectTarget).toBe("/admin/access");
  });

  it("stops execution: code after the guard never runs when unauthenticated", async () => {
    let sideEffect = false;
    const guarded = async () => {
      await requireAdminAction();
      sideEffect = true; // privileged work — must be unreachable
    };

    await expect(guarded()).rejects.toThrow("NEXT_REDIRECT");
    expect(sideEffect).toBe(false);
  });

  it("returns normally when authenticated", async () => {
    await unlockWith(SECRET);
    await expect(requireAdminAction()).resolves.toBeUndefined();
    expect(redirectTarget).toBeNull();
  });
});
