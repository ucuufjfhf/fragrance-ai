import { describe, expect, it } from "vitest";

import {
  ADMIN_ACCESS_COOKIE,
  adminAccessCookieOptions,
  adminAccessCookieValue,
  hashAdminSecret,
  isAdminAccessConfigured,
  isAdminRequestAuthorized,
  safeAdminRedirectPath,
} from "@/lib/admin/access";

/**
 * Pure tests for the minimal admin access gate (pre-deployment hardening).
 * No network, no DB: the gate is a shared-secret comparison over SHA-256
 * hashes, so every security-relevant decision is unit-testable here —
 * fail-closed behavior, hash-vs-secret cookie semantics, cookie flags, and
 * the open-redirect guard.
 */

const SECRET = "correct horse battery staple";
const WRONG = "wrong password";

describe("isAdminAccessConfigured", () => {
  it("fails closed on missing/empty/whitespace configuration", () => {
    expect(isAdminAccessConfigured(undefined)).toBe(false);
    expect(isAdminAccessConfigured(null)).toBe(false);
    expect(isAdminAccessConfigured("")).toBe(false);
    expect(isAdminAccessConfigured("   ")).toBe(false);
  });

  it("accepts a real secret (type guard)", () => {
    if (isAdminAccessConfigured(SECRET)) {
      expect(SECRET.length).toBeGreaterThan(0);
    } else {
      throw new Error("type guard rejected a valid secret");
    }
  });
});

describe("hashAdminSecret", () => {
  it("is deterministic and hex-formatted", async () => {
    const a = await hashAdminSecret(SECRET);
    const b = await hashAdminSecret(SECRET);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different secrets", async () => {
    expect(await hashAdminSecret(SECRET)).not.toBe(await hashAdminSecret(WRONG));
  });

  it("never equals its input (the hash is what the cookie may carry)", async () => {
    const hash = await hashAdminSecret(SECRET);
    expect(hash).not.toContain(SECRET);
    expect(hash).not.toBe(SECRET);
  });
});

describe("isAdminRequestAuthorized (the gate decision)", () => {
  it("denies when the gate is not configured — even with a matching hash", async () => {
    const hash = await hashAdminSecret("anything");
    expect(await isAdminRequestAuthorized(hash, undefined)).toBe(false);
    expect(await isAdminRequestAuthorized(hash, null)).toBe(false);
    expect(await isAdminRequestAuthorized(hash, "")).toBe(false);
  });

  it("denies anonymous / missing / malformed cookies", async () => {
    expect(await isAdminRequestAuthorized(undefined, SECRET)).toBe(false);
    expect(await isAdminRequestAuthorized(null, SECRET)).toBe(false);
    expect(await isAdminRequestAuthorized("", SECRET)).toBe(false);
    expect(await isAdminRequestAuthorized(42, SECRET)).toBe(false);
  });

  it("denies a wrong or stale secret's hash", async () => {
    const wrongHash = await hashAdminSecret(WRONG);
    expect(await isAdminRequestAuthorized(wrongHash, SECRET)).toBe(false);
  });

  it("accepts exactly the configured secret's hash", async () => {
    const hash = await adminAccessCookieValue(SECRET);
    expect(await isAdminRequestAuthorized(hash, SECRET)).toBe(true);
  });

  it("invalidates cookies after the secret rotates", async () => {
    const oldHash = await adminAccessCookieValue("old-secret");
    expect(await isAdminRequestAuthorized(oldHash, "new-secret")).toBe(false);
  });
});

describe("adminAccessCookieOptions", () => {
  it("is httpOnly, lax, and secure outside localhost", () => {
    const prod = adminAccessCookieOptions("fragrance.example.com");
    expect(prod.httpOnly).toBe(true);
    expect(prod.sameSite).toBe("lax");
    expect(prod.secure).toBe(true);
    expect(prod.path).toBe("/admin");
    expect(prod.maxAge).toBeGreaterThan(0);
  });

  it("allows plain http locally so development stays ergonomic", () => {
    expect(adminAccessCookieOptions("localhost:3000").secure).toBe(false);
    expect(adminAccessCookieOptions("127.0.0.1:3000").secure).toBe(false);
  });
});

describe("safeAdminRedirectPath (open-redirect guard)", () => {
  it("keeps admin-relative paths", () => {
    expect(safeAdminRedirectPath("/admin/perfumes?store=s1")).toBe(
      "/admin/perfumes?store=s1",
    );
  });

  it("forces non-admin, absolute and protocol-relative targets to the admin home", () => {
    expect(safeAdminRedirectPath("https://evil.example.com")).toBe("/admin/perfumes");
    expect(safeAdminRedirectPath("//evil.example.com")).toBe("/admin/perfumes");
    expect(safeAdminRedirectPath("/\\evil.example.com")).toBe("/admin/perfumes");
    expect(safeAdminRedirectPath("/quiz")).toBe("/admin/perfumes");
    expect(safeAdminRedirectPath(undefined)).toBe("/admin/perfumes");
    expect(safeAdminRedirectPath(null)).toBe("/admin/perfumes");
  });
});

describe("cookie contract", () => {
  it("uses a fixed cookie name that never carries the raw secret", async () => {
    expect(ADMIN_ACCESS_COOKIE).toBe("admin_access");
    const value = await adminAccessCookieValue(SECRET);
    expect(value).not.toContain(SECRET);
  });
});
