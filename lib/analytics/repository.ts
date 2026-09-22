import { getPrisma } from "@/lib/db";
import type { AnalyticsEventInput } from "@/lib/analytics/types";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Server-only Prisma access for the Phase 7 analytics events.
 *
 * Writes are append-only (create only — no update, no delete) and every read
 * used by the dashboard is store + time scoped. This module is the ONLY
 * analytics touchpoint with Prisma; client components never import it.
 */

/** Persists one already-validated event. Returns false instead of throwing so
 * analytics can never break the customer flow that triggered it. */
export async function createAnalyticsEvent(input: AnalyticsEventInput): Promise<boolean> {
  try {
    const prisma = getPrisma();

    await prisma.analyticsEvent.create({
      data: {
        storeId: input.storeId,
        sessionId: input.sessionId,
        perfumeId: input.perfumeId,
        eventType: input.eventType,
        metadata:
          input.metadata === undefined
            ? undefined
            : (input.metadata as Prisma.InputJsonValue),
      },
      select: { id: true },
    });

    return true;
  } catch {
    // Observability must never take the shop down with it.
    return false;
  }
}

/** Inclusive start / exclusive end — one convention for every query. */
export interface AnalyticsDateRange {
  from: Date;
  to: Date;
}

export interface AnalyticsSummary {
  quizStarted: number;
  quizCompleted: number;
  resultViewed: number;
  recommendationsShown: number;
  perfumeClicked: number;
}

export async function getAnalyticsSummary(
  storeId: string,
  range: AnalyticsDateRange,
): Promise<AnalyticsSummary> {
  const prisma = getPrisma();
  const where = { storeId, createdAt: { gte: range.from, lt: range.to } };

  // One grouped query instead of five — the composite (storeId, createdAt)
  // index serves it directly.
  const grouped = await prisma.analyticsEvent.groupBy({
    by: ["eventType"],
    where,
    _count: { _all: true },
  });

  const counts = new Map(grouped.map((entry) => [entry.eventType, entry._count._all]));

  return {
    quizStarted: counts.get("QUIZ_STARTED") ?? 0,
    quizCompleted: counts.get("QUIZ_COMPLETED") ?? 0,
    resultViewed: counts.get("RESULT_VIEWED") ?? 0,
    recommendationsShown: counts.get("RECOMMENDATIONS_SHOWN") ?? 0,
    perfumeClicked: counts.get("PERFUME_CLICKED") ?? 0,
  };
}

export interface TopPerfumeRow {
  perfumeId: string;
  name: string;
  brand: string;
  recommendationCount: number;
  clickCount: number;
}

/**
 * Perfume-level roll-up for one store + range. Perfume join happens in SQL so
 * a perfume deleted from the catalog (never via the app) cannot break the
 * dashboard — its events still count under a placeholder name.
 */
export async function getTopPerfumes(
  storeId: string,
  range: AnalyticsDateRange,
): Promise<TopPerfumeRow[]> {
  const prisma = getPrisma();

  const events = await prisma.analyticsEvent.findMany({
    where: {
      storeId,
      createdAt: { gte: range.from, lt: range.to },
      eventType: { in: ["RECOMMENDATIONS_SHOWN", "PERFUME_CLICKED"] },
      perfumeId: { not: null },
    },
    select: { perfumeId: true, eventType: true },
  });

  // RECOMMENDATIONS_SHOWN carries { count: N } per result page view; clicks are
  // one row each. Aggregate in memory — the volume is Top-N-sized.
  const shown = await prisma.analyticsEvent.findMany({
    where: {
      storeId,
      createdAt: { gte: range.from, lt: range.to },
      eventType: "RECOMMENDATIONS_SHOWN",
    },
    select: { perfumeId: true, metadata: true },
  });

  const recommendationCounts = new Map<string, number>();

  for (const event of shown) {
    if (event.perfumeId === null) continue;

    const metadata = event.metadata as { count?: unknown } | null;
    const count = typeof metadata?.count === "number" && Number.isInteger(metadata.count) && metadata.count >= 0
      ? metadata.count
      : 0;

    recommendationCounts.set(event.perfumeId, (recommendationCounts.get(event.perfumeId) ?? 0) + count);
  }

  const clickCounts = new Map<string, number>();

  for (const event of events) {
    if (event.eventType !== "PERFUME_CLICKED" || event.perfumeId === null) continue;

    clickCounts.set(event.perfumeId, (clickCounts.get(event.perfumeId) ?? 0) + 1);
  }

  const perfumeIds = [...new Set([...recommendationCounts.keys(), ...clickCounts.keys()])];

  if (perfumeIds.length === 0) {
    return [];
  }

  // Catalog names come from this store only — store isolation at the join.
  const perfumes = await prisma.perfume.findMany({
    where: { storeId, id: { in: perfumeIds } },
    select: { id: true, name: true, brand: true },
  });

  const catalog = new Map(perfumes.map((perfume) => [perfume.id, perfume]));

  return perfumeIds
    .map((perfumeId) => {
      const known = catalog.get(perfumeId);

      return {
        perfumeId,
        name: known?.name ?? "عطر حذف‌شده",
        brand: known?.brand ?? "—",
        recommendationCount: recommendationCounts.get(perfumeId) ?? 0,
        clickCount: clickCounts.get(perfumeId) ?? 0,
      };
    })
    .sort((a, b) => b.recommendationCount - a.recommendationCount || b.clickCount - a.clickCount || a.perfumeId.localeCompare(b.perfumeId));
}

export interface DailyAnalyticsRow {
  /** ISO date (UTC day) — the dashboard renders it in Persian. */
  date: string;
  quizStarted: number;
  quizCompleted: number;
  resultViewed: number;
  perfumeClicked: number;
}

/**
 * Daily roll-up. Postgres groups by the raw timestamp; the boundaries are UTC
 * days, which is the documented MVP timezone assumption.
 */
export async function getDailyAnalytics(
  storeId: string,
  range: AnalyticsDateRange,
): Promise<DailyAnalyticsRow[]> {
  const prisma = getPrisma();

  const events = await prisma.analyticsEvent.findMany({
    where: { storeId, createdAt: { gte: range.from, lt: range.to } },
    select: { eventType: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const byDay = new Map<string, DailyAnalyticsRow>();

  const emptyRow = (date: string): DailyAnalyticsRow => ({
    date,
    quizStarted: 0,
    quizCompleted: 0,
    resultViewed: 0,
    perfumeClicked: 0,
  });

  for (const event of events) {
    const date = event.createdAt.toISOString().slice(0, 10);
    const row = byDay.get(date) ?? emptyRow(date);

    if (event.eventType === "QUIZ_STARTED") row.quizStarted += 1;
    else if (event.eventType === "QUIZ_COMPLETED") row.quizCompleted += 1;
    else if (event.eventType === "RESULT_VIEWED") row.resultViewed += 1;
    else if (event.eventType === "PERFUME_CLICKED") row.perfumeClicked += 1;

    byDay.set(date, row);
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}
