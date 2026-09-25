import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db";
import { validateStoreProvisioning } from "@/lib/admin/store-provisioning";

/**
 * Live-DB round-trip for operator store provisioning (pre-deployment
 * hardening) — the project's established live-DB exception style (read/write
 * scoped to clearly-identified temporary records, cleaned up afterward).
 *
 * Verifies the three things only the database can prove:
 *  - a valid store is created with a Prisma-generated cuid id;
 *  - a duplicate slug is rejected by the unique constraint (no duplicates);
 *  - the provisioning path has no AI dependency (no provider imports at all).
 *
 * Per-test timeouts are raised above the 5 s default: like the dataset-matrix
 * suite, these hit the remote Supabase pooler, whose cold latency can exceed
 * the default under full-suite load (documented project-wide flake source).
 */

const TEST_SLUG = `prov-test-${Date.now()}`;

afterAll(async () => {
  // Safe cleanup: delete ONLY this test's row (cascade removes nothing else —
  // a fresh store has no related rows).
  const prisma = getPrisma();
  await prisma.store.deleteMany({ where: { slug: TEST_SLUG } });
});

describe("store provisioning — live DB round-trip", () => {
  it(
    "creates a valid store with a generated id and its unique slug",
    async () => {
    const validation = validateStoreProvisioning({
      name: "فروشگاه آزمون provisioning",
      slug: TEST_SLUG,
      websiteUrl: "https://prov-test.invalid",
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }

    const prisma = getPrisma();
    const store = await prisma.store.create({
      data: { ...validation.value },
      select: { id: true, slug: true, name: true, active: true },
    });
    expect(store.id).toMatch(/^[a-z0-9]{20,}$/); // Prisma cuid, app-generated
    expect(store.slug).toBe(TEST_SLUG);
    expect(store.name).toBe("فروشگاه آزمون provisioning");
    expect(store.active).toBe(true);
    },
    20_000,
  );

  it(
    "rejects a duplicate slug (rerun safety — no duplicate rows)",
    async () => {
    const prisma = getPrisma();
    // One pre-existing row with the same slug (either from the prior test or
    // created here if that test was skipped) — then assert the DB rejects it.
    await prisma.store.upsert({
      where: { slug: TEST_SLUG },
      update: {},
      create: { name: "فروشگاه آزمون provisioning", slug: TEST_SLUG },
    });

    let violated = false;
    try {
      await prisma.store.create({
        data: { name: "دومی", slug: TEST_SLUG },
      });
    } catch (error) {
      violated =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002";
    }

    expect(violated).toBe(true);

    const count = await prisma.store.count({ where: { slug: TEST_SLUG } });
    expect(count).toBe(1);
    },
    20_000,
  );

  it(
    "provisioning depends on no AI module (static import surface)",
    async () => {
    // Guard against accidental coupling: the provisioning validator must not
    // pull in the AI layer.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/admin/store-provisioning.ts", "utf8");
    expect(source).not.toContain("lib/ai");
    expect(source).not.toContain("AIProvider");
    expect(source).not.toContain("createAIProvider");
    },
    20_000,
  );
});
