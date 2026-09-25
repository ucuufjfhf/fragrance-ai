import "dotenv/config";

import { getPrisma } from "@/lib/db";
import { validateStoreProvisioning } from "@/lib/admin/store-provisioning";

/**
 * Operator-only store provisioning (pre-deployment hardening).
 *
 * Usage:
 *
 *   npx tsx scripts/create-store.ts --name "عطر فروشگاه من" \
 *     --slug my-shop [--website-url https://my-shop.ir] [--logo-url https://.../logo.png]
 *
 * Creates ONE merchant Store with a Prisma-generated cuid id and a unique
 * slug. The printed id is what the admin panel and the widget embed snippet
 * use (`data-store-id="..."`). No AI dependency; no customer-facing surface.
 *
 * Idempotent safety: a duplicate slug is rejected by the database's unique
 * constraint (caught as Prisma P2002) and reported clearly — rerunning never
 * creates duplicates. Nothing is ever deleted or updated by this script.
 */

interface ParsedArgs {
  name?: string;
  slug?: string;
  websiteUrl?: string;
  logoUrl?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    switch (key) {
      case "--name":
        args.name = value;
        i += 1;
        break;
      case "--slug":
        args.slug = value;
        i += 1;
        break;
      case "--website-url":
        args.websiteUrl = value;
        i += 1;
        break;
      case "--logo-url":
        args.logoUrl = value;
        i += 1;
        break;
      default:
        // Unknown flags are ignored so typo'd flags cannot create garbage.
        break;
    }
  }
  return args;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  const validation = validateStoreProvisioning({
    name: args.name ?? "",
    slug: args.slug ?? "",
    websiteUrl: args.websiteUrl,
    logoUrl: args.logoUrl,
  });

  if (!validation.ok) {
    console.error(`خطا (${validation.field}): ${validation.reason}`);
    console.error(
      'مثال: npx tsx scripts/create-store.ts --name "عطر من" --slug my-shop',
    );
    return 1;
  }

  const prisma = getPrisma();
  const { name, slug, websiteUrl, logoUrl } = validation.value;

  try {
    const store = await prisma.store.create({
      data: { name, slug, websiteUrl, logoUrl },
      select: { id: true, slug: true, name: true },
    });

    console.log("فروشگاه ساخته شد ✓");
    console.log(`  id:    ${store.id}`);
    console.log(`  slug:  ${store.slug}`);
    console.log(`  name:  ${store.name}`);
    console.log("");
    console.log("مرحلهٔ بعد:");
    console.log(`  1) /admin/perfumes?store=${store.id} → محصولات را وارد کنید.`);
    console.log(`  2) کد نصب ویجت: data-store-id="${store.id}"`);
    return 0;
  } catch (error) {
    // Prisma unique-violation code: duplicate slug (rerun safety).
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      console.error(`خطا: نامک «${slug}» قبلاً استفاده شده است. نامک دیگری انتخاب کنید.`);
      return 1;
    }
    console.error("خطا در ساخت فروشگاه؛ اتصال پایگاه داده را بررسی کنید.");
    return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(1));
