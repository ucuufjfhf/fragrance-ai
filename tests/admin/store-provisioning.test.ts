import { describe, expect, it } from "vitest";

import { validateStoreProvisioning } from "@/lib/admin/store-provisioning";

/**
 * Pure tests for operator store provisioning validation (pre-deployment
 * hardening). The database behaviors (unique-slug enforcement, Prisma cuid
 * generation) are covered by the live round-trip suite
 * `store-provisioning.live.test.ts`; everything decidable without a DB is
 * covered here.
 */

describe("validateStoreProvisioning — valid input", () => {
  it("accepts a minimal valid store", () => {
    const result = validateStoreProvisioning({ name: "عطر فروشگاه من", slug: "my-shop" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("عطر فروشگاه من");
      expect(result.value.slug).toBe("my-shop");
      expect(result.value.websiteUrl).toBeUndefined();
      expect(result.value.logoUrl).toBeUndefined();
    }
  });

  it("normalizes slug case and surrounding whitespace", () => {
    const result = validateStoreProvisioning({ name: "X", slug: "  My-Shop  " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.slug).toBe("my-shop");
    }
  });

  it("keeps optional URLs when valid and drops empty ones", () => {
    const result = validateStoreProvisioning({
      name: "X",
      slug: "shop",
      websiteUrl: "https://my-shop.ir",
      logoUrl: "   ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.websiteUrl).toBe("https://my-shop.ir");
      expect(result.value.logoUrl).toBeUndefined();
    }
  });
});

describe("validateStoreProvisioning — invalid name", () => {
  it("rejects empty/whitespace/oversized names", () => {
    expect(validateStoreProvisioning({ name: "", slug: "shop" }).ok).toBe(false);
    expect(validateStoreProvisioning({ name: "   ", slug: "shop" }).ok).toBe(false);
    expect(
      validateStoreProvisioning({ name: "ا".repeat(121), slug: "shop" }).ok,
    ).toBe(false);
  });
});

describe("validateStoreProvisioning — invalid slug", () => {
  it("rejects empty slugs", () => {
    expect(validateStoreProvisioning({ name: "X", slug: "" }).ok).toBe(false);
    expect(validateStoreProvisioning({ name: "X", slug: "   " }).ok).toBe(false);
  });

  it("rejects slugs outside 3–64 chars", () => {
    expect(validateStoreProvisioning({ name: "X", slug: "ab" }).ok).toBe(false);
    expect(validateStoreProvisioning({ name: "X", slug: "a".repeat(65) }).ok).toBe(false);
  });

  it("rejects characters that are not URL-safe", () => {
    for (const bad of ["My Shop", "my_shop", "my/shop", "فروشگاه", "my.shop", "shop?1"]) {
      expect(validateStoreProvisioning({ name: "X", slug: bad }).ok).toBe(false);
    }
  });

  it("rejects leading/trailing hyphens", () => {
    expect(validateStoreProvisioning({ name: "X", slug: "-shop" }).ok).toBe(false);
    expect(validateStoreProvisioning({ name: "X", slug: "shop-" }).ok).toBe(false);
  });
});

describe("validateStoreProvisioning — invalid URLs", () => {
  it("rejects non-http(s) and oversized URLs", () => {
    const noScheme = validateStoreProvisioning({
      name: "X",
      slug: "shop",
      websiteUrl: "ftp://my-shop.ir",
    });
    expect(noScheme.ok).toBe(false);
    if (!noScheme.ok) {
      expect(noScheme.field).toBe("websiteUrl");
    }

    const logo = validateStoreProvisioning({
      name: "X",
      slug: "shop",
      logoUrl: `https://x.ir/${"a".repeat(600)}`,
    });
    expect(logo.ok).toBe(false);
    if (!logo.ok) {
      expect(logo.field).toBe("logoUrl");
    }
  });
});
