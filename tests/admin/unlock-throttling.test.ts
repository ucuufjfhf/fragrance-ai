import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rateCounts = new Map<string, number>();
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ $queryRaw: async (_s: TemplateStringsArray, ...v: unknown[]) => { const n = (rateCounts.get(String(v[0])) ?? 0) + 1; rateCounts.set(String(v[0]), n); return [{ count: n }]; }, rateLimitCounter: { deleteMany: vi.fn(async ({ where }: { where: { key?: string } }) => { if (where.key) for (const k of rateCounts.keys()) if (k === where.key || k.startsWith(`${where.key}:`)) rateCounts.delete(k); return { count: 0 }; }) } }) }));
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
  rateCounts.clear();
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

    vi.clearAllMocks();
    expect(await redirectPath(form("wrong"))).toContain("error=wrong");
  });

  it("invalidates the admin cookie on logout", async () => {
    await logoutAdminAccessAction().catch((error) => error);
    expect(mocks.setCookie).toHaveBeenCalledWith("admin_access", "", expect.objectContaining({ maxAge: 0, path: "/admin" }));
  });

});
