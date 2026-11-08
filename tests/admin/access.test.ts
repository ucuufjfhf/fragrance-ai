import { describe, expect, it } from "vitest";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_ACCESS_TOKEN_TTL_SECONDS,
  ADMIN_SECRET_MIN_LENGTH,
  adminAccessCookieOptions,
  constantTimeEqual,
  hashAdminSecret,
  isAdminAccessConfigured,
  isAdminRequestAuthorized,
  mintAdminAccessToken,
  safeAdminRedirectPath,
} from "@/lib/admin/access";

/**
 * Pure tests for the minimal admin access gate (pre-deployment hardening).
 * No network, no DB: the gate is a shared-secret comparison plus a signed,
 * expiring token, so every security-relevant decision is unit-testable here —
 * fail-closed behavior, the length floor, token minting/verification, the
 * pass-the-hash regression, cookie flags and the open-redirect guard.
 */

const SECRET = "correct horse battery staple";
const WRONG = "wrong password";
const OTHER_SECRET = "a completely different secret";
/** Fixed clock: every token assertion below is relative to this instant. */
const NOW_MS = 1_782_000_000_000;
const expirySeconds = (nowMs: number, offsetSeconds = 0): number =>
  Math.floor(nowMs / 1000) + ADMIN_ACCESS_TOKEN_TTL_SECONDS + offsetSeconds;

describe("isAdminAccessConfigured", () => {
  it("fails closed on missing/empty/whitespace configuration", () => {
    expect(isAdminAccessConfigured(undefined)).toBe(false);
    expect(isAdminAccessConfigured(null)).toBe(false);
    expect(isAdminAccessConfigured("")).toBe(false);
    expect(isAdminAccessConfigured("   ")).toBe(false);
  });

  it("requires a secret at least ADMIN_SECRET_MIN_LENGTH characters long", () => {
    expect(ADMIN_SECRET_MIN_LENGTH).toBe(20);
    expect(isAdminAccessConfigured("a".repeat(19))).toBe(false);
    expect(isAdminAccessConfigured("a".repeat(20))).toBe(true);
    // The floor applies to the trimmed value; surrounding space is not strength.
    expect(isAdminAccessConfigured(`  ${"a".repeat(19)}  `)).toBe(false);
    expect(isAdminAccessConfigured(`  ${"a".repeat(20)}  `)).toBe(true);
  });

  it("accepts a real secret (type guard)", () => {
    if (isAdminAccessConfigured(SECRET)) {
      expect(SECRET.trim().length).toBeGreaterThanOrEqual(ADMIN_SECRET_MIN_LENGTH);
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

  it("never equals its input", async () => {
    const hash = await hashAdminSecret(SECRET);
    expect(hash).not.toContain(SECRET);
    expect(hash).not.toBe(SECRET);
  });
});

describe("mintAdminAccessToken", () => {
  it("mints v1.<expiry>.<hmac> with the shared 7-day expiry, deterministically", async () => {
    const token = await mintAdminAccessToken(SECRET, NOW_MS);
    const [tag, expires, hmac] = token.split(".");

    expect(ADMIN_ACCESS_TOKEN_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(tag).toBe("v1");
    expect(Number(expires)).toBe(expirySeconds(NOW_MS));
    expect(hmac).toMatch(/^[0-9a-f]{64}$/);
    // Stateless verification needs determinism for (secret, expiry).
    expect(await mintAdminAccessToken(SECRET, NOW_MS)).toBe(token);
    expect(token).not.toContain(SECRET);
  });

  it("keys the signature with the secret: different secrets, different tokens", async () => {
    expect(await mintAdminAccessToken(SECRET, NOW_MS)).not.toBe(
      await mintAdminAccessToken(OTHER_SECRET, NOW_MS),
    );
  });
});

describe("isAdminRequestAuthorized (the gate decision)", () => {
  it("denies when the gate is not configured — even with a valid token", async () => {
    const token = await mintAdminAccessToken(SECRET, NOW_MS);
    expect(await isAdminRequestAuthorized(token, undefined, NOW_MS)).toBe(false);
    expect(await isAdminRequestAuthorized(token, null, NOW_MS)).toBe(false);
    expect(await isAdminRequestAuthorized(token, "", NOW_MS)).toBe(false);
    expect(await isAdminRequestAuthorized(token, "a".repeat(19), NOW_MS)).toBe(false);
  });

  it("denies anonymous / missing / non-string cookies", async () => {
    expect(await isAdminRequestAuthorized(undefined, SECRET, NOW_MS)).toBe(false);
    expect(await isAdminRequestAuthorized(null, SECRET, NOW_MS)).toBe(false);
    expect(await isAdminRequestAuthorized("", SECRET, NOW_MS)).toBe(false);
    expect(await isAdminRequestAuthorized(42, SECRET, NOW_MS)).toBe(false);
  });

  it("accepts a freshly minted token for the configured secret", async () => {
    const token = await mintAdminAccessToken(SECRET, NOW_MS);
    expect(await isAdminRequestAuthorized(token, SECRET, NOW_MS)).toBe(true);
  });

  it("REJECTS a bare SHA-256(secret) cookie (pass-the-hash is dead)", async () => {
    // Regression pin: this exact value used to BE the credential. It is not a
    // token, carries no expiry and no signature, and must authorize nothing.
    const hash = await hashAdminSecret(SECRET);
    expect(await isAdminRequestAuthorized(hash, SECRET, NOW_MS)).toBe(false);
    expect(await isAdminRequestAuthorized(hash, SECRET)).toBe(false);
  });

  it("rejects an expired token (injected clock), accepts it before expiry", async () => {
    const token = await mintAdminAccessToken(SECRET, NOW_MS);
    const atExpiryMs = expirySeconds(NOW_MS) * 1000;

    expect(await isAdminRequestAuthorized(token, SECRET, NOW_MS)).toBe(true);
    expect(await isAdminRequestAuthorized(token, SECRET, atExpiryMs - 1000)).toBe(true);
    // Strictly in the future: the expiry second itself is already stale.
    expect(await isAdminRequestAuthorized(token, SECRET, atExpiryMs)).toBe(false);
    expect(await isAdminRequestAuthorized(token, SECRET, atExpiryMs + 1000)).toBe(false);
  });

  it("rejects a tampered expiry and a tampered signature", async () => {
    const token = await mintAdminAccessToken(SECRET, NOW_MS);
    const [tag, expires, hmac] = token.split(".");

    const laterExpiry = `${tag}.${Number(expires) + 60}.${hmac}`;
    expect(await isAdminRequestAuthorized(laterExpiry, SECRET, NOW_MS)).toBe(false);

    const flipped = `${hmac.slice(0, -1)}${hmac.endsWith("0") ? "1" : "0"}`;
    expect(await isAdminRequestAuthorized(`${tag}.${expires}.${flipped}`, SECRET, NOW_MS)).toBe(
      false,
    );
  });

  it("rejects a token minted under a different secret (rotation invalidates)", async () => {
    const oldToken = await mintAdminAccessToken("old-secret-long-enough", NOW_MS);
    expect(await isAdminRequestAuthorized(oldToken, SECRET, NOW_MS)).toBe(false);
    expect(
      await isAdminRequestAuthorized(await mintAdminAccessToken(SECRET, NOW_MS), OTHER_SECRET, NOW_MS),
    ).toBe(false);
  });

  it("rejects malformed values in every shape", async () => {
    const token = await mintAdminAccessToken(SECRET, NOW_MS);
    const [tag, expires, hmac] = token.split(".");
    const malformed = [
      "not-a-valid-token",
      `${tag}.${expires}`, // two parts
      `${tag}.${expires}.${hmac}.extra`, // four parts
      `v2.${expires}.${hmac}`, // unknown version tag
      `${tag}.soon.${hmac}`, // non-numeric expiry
      `${tag}.0${expires}.${hmac}`, // non-canonical digits
      `${tag}.-${expires}.${hmac}`, // signed expiry
      `${tag}.${expires}.`, // empty signature
      `${tag}.${expires}.deadbeef`, // garbage signature
    ];

    for (const value of malformed) {
      expect(await isAdminRequestAuthorized(value, SECRET, NOW_MS), value).toBe(false);
    }
  });
});

describe("constantTimeEqual (shared credential comparison)", () => {
  it("compares equal, different and differently-sized strings", () => {
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("abc", "")).toBe(false);
  });
});

describe("adminAccessCookieOptions", () => {
  it("is httpOnly, lax, and secure outside localhost", () => {
    const prod = adminAccessCookieOptions("fragrance.example.com");
    expect(prod.httpOnly).toBe(true);
    expect(prod.sameSite).toBe("lax");
    expect(prod.secure).toBe(true);
    expect(prod.path).toBe("/admin");
    // One source for the token lifetime and the cookie's window.
    expect(prod.maxAge).toBe(ADMIN_ACCESS_TOKEN_TTL_SECONDS);
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
  it("carries a v1 token, neither the secret nor its hash", async () => {
    expect(ADMIN_ACCESS_COOKIE).toBe("admin_access");
    const token = await mintAdminAccessToken(SECRET, NOW_MS);
    expect(token).not.toContain(SECRET);
    expect(token.startsWith("v1.")).toBe(true);
    expect(token).not.toBe(await hashAdminSecret(SECRET));
  });
});
