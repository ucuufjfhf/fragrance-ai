"use server";

import { revalidatePath } from "next/cache";

import { requireAdminAction } from "@/lib/admin/server-access";
import { regenerateStoreReportToken } from "@/lib/store-report/report";
import type { AdminActionState } from "@/app/admin/perfumes/actions";

/**
 * Server action: rotate a store's report link (Phase 7 pilot reporting).
 *
 * Admin-gated like every other admin mutation; the old link dies the moment
 * the new token is written. Outcomes are returned as data so the panel can
 * render Persian feedback inline.
 */

const MESSAGES = {
  regenerated: "پیوند تازه گزارش ساخته شد؛ پیوند قبلی باطل شد.",
  notFound: "فروشگاه مورد نظر پیدا نشد.",
  dbError: "ذخیره‌سازی با خطا مواجه شد؛ دوباره تلاش کنید.",
} as const;

export async function regenerateReportTokenAction(
  storeId: string,
): Promise<AdminActionState & { reportToken?: string }> {
  await requireAdminAction();

  if (!storeId) {
    return { ok: false, message: MESSAGES.notFound };
  }

  try {
    const result = await regenerateStoreReportToken(storeId);

    if (!result.ok) {
      return { ok: false, message: MESSAGES.notFound };
    }

    revalidatePath("/admin/analytics");

    return { ok: true, message: MESSAGES.regenerated, reportToken: result.reportToken };
  } catch {
    return { ok: false, message: MESSAGES.dbError };
  }
}
