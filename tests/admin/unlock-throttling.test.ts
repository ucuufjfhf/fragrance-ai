import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ counts: new Map<string, number>(), fail: false }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({
  $queryRaw: async (_s: TemplateStringsArray, ...v: unknown[]) => {
    if (dbMocks.fail) throw new Error("database unavailable");
    const n = (dbMocks.counts.get(String(v[0])) ?? 0) + 1;
    dbMocks.counts.set(String(v[0]), n);
    return [{ count: n }];
  },
  rateLimitCounter: { deleteMany: vi.fn(async ({ where }: { where: { key?: string } }) => { if (where.key) for (const k of dbMocks.counts.keys()) if (k === where.key || k.startsWith(`${where.key}:`)) dbMocks.counts.delete(k); return { count: 0 }; }) },
}) }));
const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    const error = new Error(path) as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;${path}`;
    throw error;
  }),
  setCookie: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: () => ({ set: mocks.setCookie }),
  headers: () => new Headers({ host: "app.example", "x-forwarded-for": "198.51.100.25" }),
}));

import { logoutAdminAccessAction, unlockAdminAccessAction } from "@/app/admin/access/actions";
import { hashAdminSecret } from "@/lib/admin/access";
import { resetRateLimitsForTests } from "@/lib/rate-limit";

const SECRET = "correct-secret-for-test";
const redirectPath = async (formData: FormData): Promise<string> => {
  try {
    await unlockAdminAccessAction(formData);
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    return digest?.split(";")[1] ?? "";
  }
  return "success";
};
const form = (secret: string): FormData => {
  const value = new FormData();
  value.set("secret", secret);
  value.set("next", "/admin/perfumes");
  return value;
};

beforeEach(() => {
  dbMocks.counts.clear();
  dbMocks.fail = false;
  vi.clearAllMocks();
  resetRateLimitsForTests();
  vi.stubEnv("ADMIN_ACCESS_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("admin unlock throttling", () => {
  it("throttles repeated failures with a generic temporary lockout", async () => {
    for (let index = 0; index < 5; index += 1) {
      expect(await redirectPath(form("wrong"))).toContain("error=wrong");
    }
    expect(await redirectPath(form("wrong"))).toContain("error=rate_limited");
  });

  it("keeps successful authentication working and clears failures", async () => {
    for (let index = 0; index < 4; index += 1) await redirectPath(form("wrong"));
    expect(await redirectPath(form(SECRET))).toBe("/admin/perfumes");
    expect(mocks.setCookie).toHaveBeenCalledOnce();

    // The cookie carries the signed token, never the secret's hash.
    const [cookieName, cookieValue] = mocks.setCookie.mock.calls[0] as [string, string];
    expect(cookieName).toBe("admin_access");
    expect(cookieValue).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
    expect(cookieValue).not.toBe(await hashAdminSecret(SECRET));

    vi.clearAllMocks();
    expect(await redirectPath(form("wrong"))).toContain("error=wrong");
  });

  it("fails closed when the rate-limit database is unavailable", async () => {
    // Fail CLOSED is the point: an uncountable attempt is refused, and even the
    // correct secret cannot obtain a cookie while the limiter is blind.
    dbMocks.fail = true;

    expect(await redirectPath(form(SECRET))).toContain("error=rate_limited");
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("invalidates the admin cookie on logout", async () => {
    await logoutAdminAccessAction().catch((error) => error);
    expect(mocks.setCookie).toHaveBeenCalledWith("admin_access", "", expect.objectContaining({ maxAge: 0, path: "/admin" }));
  });

});
