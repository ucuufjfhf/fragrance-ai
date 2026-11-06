import {
  validateAnalyticsEvent,
  type AnalyticsEventInput,
} from "@/lib/analytics/types";
import { createAnalyticsEvent } from "@/lib/analytics/repository";
import { getPrisma } from "@/lib/db";

/**
 * Business-level analytics service (Phase 7).
 *
 * `recordAnalyticsEvent` is the single write path for untrusted input: it
 * validates the shape (pure contract), then verifies DB relationships the
 * browser cannot be trusted about — the store exists and is active, and a
 * perfume id really belongs to that store (§10/§13). Only then is the event
 * appended.
 *
 * Recording never throws and never returns DB internals: analytics is
 * observational, so any failure degrades to `{ ok: false }` and the customer
 * flow that triggered it carries on untouched.
 */

export type RecordEventResult =
  | { ok: true }
  | { ok: false; reason: "INVALID_EVENT" | "STORE_NOT_FOUND" | "PERFUME_NOT_IN_STORE"; detail?: string };

/**
 * Keeps `metadata.perfumeIds` only when EVERY listed id belongs to the event's
 * store.
 *
 * The shape is already guaranteed by the contract; ownership is the DB half.
 * Any doubt — no store on the event, a foreign id, or a failed query — drops
 * the field and keeps the event: the list is enrichment and must never cost the
 * merchant the impression count it rides on.
 */
async function withVerifiedShownIds(event: AnalyticsEventInput): Promise<AnalyticsEventInput> {
  const metadata = event.metadata;

  if (metadata === undefined || metadata.perfumeIds === undefined) {
    return event;
  }

  const ids = metadata.perfumeIds as string[];
  const { perfumeIds: _dropped, ...rest } = metadata;

  if (event.storeId === undefined) {
    return { ...event, metadata: rest };
  }

  try {
    const prisma = getPrisma();
    const found = await prisma.perfume.findMany({
      where: { storeId: event.storeId, id: { in: ids } },
      select: { id: true },
    });

    // Fewer rows than ids means at least one id is not this store's (or does
    // not exist) — the whole list goes, the event stays.
    return found.length === ids.length ? event : { ...event, metadata: rest };
  } catch {
    return { ...event, metadata: rest };
  }
}

export async function recordAnalyticsEvent(input: unknown): Promise<RecordEventResult> {
  const validation = validateAnalyticsEvent(input);

  if (!validation.ok) {
    return { ok: false, reason: "INVALID_EVENT", detail: validation.reason };
  }

  const event = await withVerifiedShownIds(validation.value);

  // Store relationship check — an event with an unknown/inactive store id is
  // rejected rather than silently attributed to nobody.
  if (event.storeId !== undefined) {
    try {
      const prisma = getPrisma();
      const store = await prisma.store.findFirst({
        where: { id: event.storeId, active: true },
        select: { id: true },
      });

      if (!store) {
        return { ok: false, reason: "STORE_NOT_FOUND" };
      }
    } catch {
      return { ok: false, reason: "STORE_NOT_FOUND" };
    }
  }

  // Perfume ∈ store check — a foreign-store perfume id can never be recorded.
  if (event.perfumeId !== undefined) {
    try {
      const prisma = getPrisma();
      const perfume = await prisma.perfume.findFirst({
        where: { id: event.perfumeId, ...(event.storeId ? { storeId: event.storeId } : {}) },
        select: { id: true },
      });

      if (!perfume) {
        return { ok: false, reason: "PERFUME_NOT_IN_STORE" };
      }
    } catch {
      return { ok: false, reason: "PERFUME_NOT_IN_STORE" };
    }
  }

  const persisted = await createAnalyticsEvent(event as AnalyticsEventInput);

  return persisted ? { ok: true } : { ok: false, reason: "INVALID_EVENT", detail: "persistence failed." };
}

// ---------------------------------------------------------------------------
// Dashboard reads — every query is store-scoped (§13); ranges are built here
// so the boundary convention (inclusive from, exclusive to) lives in one place.
// Timezone assumption: UTC day boundaries for the MVP (documented in README).
// ---------------------------------------------------------------------------

import {
  getAnalyticsSummary,
  getDailyAnalytics,
  getTopPerfumes,
  type AnalyticsDateRange,
  type AnalyticsSummary,
  type DailyAnalyticsRow,
  type TopPerfumeRow,
} from "@/lib/analytics/repository";

export type AnalyticsRangePreset = "today" | "7d" | "30d";

const RANGE_DAYS: Record<Exclude<AnalyticsRangePreset, "today">, number> = {
  "7d": 7,
  "30d": 30,
};

/** Validates the untrusted range param; anything unknown falls back to 7d. */
export function parseAnalyticsRange(raw: unknown): AnalyticsRangePreset {
  return raw === "today" || raw === "30d" ? raw : "7d";
}

/**
 * Builds the UTC date range for a preset: `today` = the current UTC day,
 * `7d`/`30d` = the last N UTC days including today, exclusive `to` boundary.
 */
export function buildAnalyticsRange(preset: AnalyticsRangePreset, now: Date = new Date()): AnalyticsDateRange {
  const to = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0,
    ),
  );

  if (preset === "today") {
    const from = new Date(to);

    from.setUTCDate(from.getUTCDate() - 1);

    return { from, to };
  }

  const from = new Date(to);

  from.setUTCDate(from.getUTCDate() - RANGE_DAYS[preset]);

  return { from, to };
}

export interface AnalyticsDashboardData {
  range: AnalyticsRangePreset;
  summary: AnalyticsSummary;
  topPerfumes: TopPerfumeRow[];
  daily: DailyAnalyticsRow[];
  /** Derived KPIs; null means «—» (zero denominator — never NaN/Infinity). */
  completionRate: number | null;
  clickRate: number | null;
  /** False when the store recorded no events at all in the range. */
  hasData: boolean;
}

export async function getAnalyticsDashboardData(
  storeId: string,
  preset: AnalyticsRangePreset,
): Promise<AnalyticsDashboardData> {
  const range = buildAnalyticsRange(preset);
  const summary = await getAnalyticsSummary(storeId, range);
  const topPerfumes = await getTopPerfumes(storeId, range);
  const daily = await getDailyAnalytics(storeId, range);

  return {
    range: preset,
    summary,
    topPerfumes,
    daily,
    completionRate:
      summary.quizStarted === 0
        ? null
        : (summary.quizCompleted / summary.quizStarted) * 100,
    clickRate:
      summary.recommendationsShown === 0
        ? null
        : (summary.perfumeClicked / summary.recommendationsShown) * 100,
    hasData: topPerfumes.length > 0 || daily.length > 0 || Object.values(summary).some((count) => count > 0),
  };
}
