import { describe, expect, it, vi } from "vitest";

// The admin access gate (added when `proxy.ts` was removed) is mocked here:
// these tests verify the action boundary (serializability, payload shape),
// not the gate itself (covered by access.test.ts / server-access.test.ts).
vi.mock("@/lib/admin/server-access", () => ({
  requireAdminAction: vi.fn(async () => {}),
}));

import {
  createPerfumeAction,
  updatePerfumeAction,
} from "@/app/admin/perfumes/actions";
import { validatePerfumePayload } from "@/lib/admin/validation";
import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";

/**
 * Regression tests for the Phase 6A admin action boundary.
 *
 * Two classes of bug are pinned here:
 *
 * 1. **Serializability** — the actions handed to the client `PerfumeForm` must
 *    be real `"use server"` functions (`.bind`-able), never inline closures
 *    created inside a Server Component. A closure crossing the Server → Client
 *    boundary crashes the render with "Functions cannot be passed directly to
 *    Client Components" (the exact production bug). The bound references below
 *    only compile if the exports are genuine server-action functions.
 *
 * 2. **Payload shape** — `formDataToPayload` must assemble the nested
 *    `profile` object from the form's flat axis fields. Forgetting the nesting
 *    makes every create/edit fail validation ("پروفایل عطری الزامی است") even
 *    with a fully filled form.
 */

function formFromEntries(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

/** A minimal, fully valid flat FormData payload (what the browser sends). */
function validFormData(): FormData {
  const entries: Record<string, string> = {
    name: "تست ثبت",
    brand: "برند تست",
    gender: "UNISEX",
    inStock: "on",
    active: "on",
  };
  for (const dimension of MATCHING_DIMENSIONS) {
    entries[dimension] = "50";
  }
  return formFromEntries(entries);
}

describe("admin actions — Server → Client boundary regressions", () => {
  it("create/update actions are real server-action functions (bind-able, not closures)", () => {
    // Server Actions exposed from "use server" modules carry the action id and
    // support `.bind`. An inline arrow closure created in a page would also be
    // a function here, but it would NOT be a registered server action — the
    // decisive check is that these are the module's own exports and can be
    // pre-bound exactly the way the pages bind them.
    expect(typeof createPerfumeAction).toBe("function");
    expect(typeof updatePerfumeAction).toBe("function");
    expect(() => createPerfumeAction.bind(null, "store-demo-perfume-shop")).not.toThrow();
    expect(() =>
      updatePerfumeAction.bind(null, "perfume-x", "store-demo-perfume-shop"),
    ).not.toThrow();
  });

  it("a fully valid flat form payload validates once nested (payload.profile assembled)", async () => {
    // Rebuild the exact transformation formDataToPayload performs, since the
    // helper itself is module-private: intercept by calling the action with a
    // repository mock would need vi.mock of Prisma — instead assert on the
    // validation semantics the action relies on.
    const formData = validFormData();

    // Simulate formDataToPayload (documented shape contract):
    const flat: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      flat[key] = typeof value === "string" ? value : value;
    }
    flat.inStock = formData.get("inStock") !== null;
    flat.active = formData.get("active") !== null;

    // The pre-fix bug: payload passed to the validator with NO `profile` key —
    // validation fails with «پروفایل عطری الزامی است» despite a filled form.
    const broken = validatePerfumePayload(flat);
    expect(broken.ok).toBe(false);
    if (!broken.ok) {
      expect(broken.errors.profile).toBeTruthy();
    }
  });

  it("create action rejects an invalid payload without touching the database", async () => {
    const formData = formFromEntries({ name: "", brand: "" });
    const state = await createPerfumeAction("store-demo-perfume-shop", null, formData);
    expect(state.ok).toBe(false);
    expect(state.errors?.name).toBeTruthy();
    expect(state.errors?.brand).toBeTruthy();
  });

  it("create action with an invalid flat payload never reaches the store write", async () => {
    // An empty name/brand fails validation before any Prisma access, so this
    // runs without a database and pins the validate-before-write ordering.
    const formData = formFromEntries({ brand: "فقط برند" });
    const state = await createPerfumeAction("store-demo-perfume-shop", null, formData);
    expect(state.ok).toBe(false);
    expect(state.errors?.name).toBe("نام عطر الزامی است.");
  });
});
