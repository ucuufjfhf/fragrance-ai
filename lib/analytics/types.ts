/**
 * The canonical analytics event contract (Phase 7).
 *
 * `ANALYTICS_EVENT_TYPES` is the ONE source of truth for event type strings —
 * no other module may hardcode them. Every write goes through
 * `validateAnalyticsEvent` (which checks membership here) and every dashboard
 * query filters by these constants, so a typo can never fork the contract.
 */

export const ANALYTICS_EVENT_TYPES = [
  "QUIZ_STARTED",
  "QUIZ_COMPLETED",
  "RESULT_VIEWED",
  "RECOMMENDATIONS_SHOWN",
  "PERFUME_CLICKED",
  "WIDGET_VIEWED",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/** Hard cap on the serialized metadata JSON — analytics is not a data store. */
export const ANALYTICS_METADATA_MAX_BYTES = 1024;

/**
 * How many perfume ids one RECOMMENDATIONS_SHOWN may list.
 *
 * This is the results engine's Top-N (`RESULTS_TOP_N` in lib/results/params.ts
 * is 3); the number is repeated rather than imported because that module pulls
 * in the scoring bank and the archetypes, and this contract must stay pure and
 * dependency-free so both the browser and the server can share it.
 */
export const MAX_SHOWN_PERFUME_IDS = 3;

/** Input accepted from an untrusted caller (browser / server integration). */
export interface AnalyticsEventInput {
  eventType: AnalyticsEventType;
  storeId?: string;
  sessionId?: string;
  perfumeId?: string;
  metadata?: Record<string, unknown>;
}

export type AnalyticsEventValidation =
  | { ok: true; value: AnalyticsEventInput }
  | { ok: false; reason: string };

/** Opaque cuid-shaped id: anything else from the wire is rejected. */
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function isOptionalId(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && ID_PATTERN.test(value));
}

/**
 * Shape check for `metadata.perfumeIds` — the per-perfume impression list.
 *
 * Returns the ids only when the whole array is valid (1–`MAX_SHOWN_PERFUME_IDS`
 * id-shaped strings, display order preserved), otherwise null. Callers STRIP
 * the field on null instead of rejecting the event: the count is the contract,
 * the id list is enrichment, and enrichment must never cost the merchant a
 * count. Ownership (`id ∈ storeId`) is a DB relationship, so it is enforced in
 * the service — exactly like the existing `perfumeId` check.
 */
export function sanitizeShownPerfumeIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SHOWN_PERFUME_IDS) {
    return null;
  }

  if (!value.every((id) => typeof id === "string" && ID_PATTERN.test(id))) {
    return null;
  }

  return value as string[];
}

/** Drops `perfumeIds` without mutating the caller's object. */
function withoutShownPerfumeIds(metadata: Record<string, unknown>): Record<string, unknown> {
  const { perfumeIds: _dropped, ...rest } = metadata;

  return rest;
}

/**
 * Normalises metadata before the size check: a valid id list is kept as-is, an
 * invalid one is dropped so the event survives. Sanitising first means a huge
 * malformed list cannot push an otherwise-small count over the byte limit.
 */
function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  if (metadata.perfumeIds === undefined) {
    return metadata;
  }

  const ids = sanitizeShownPerfumeIds(metadata.perfumeIds);

  return ids === null ? withoutShownPerfumeIds(metadata) : { ...metadata, perfumeIds: ids };
}

/**
 * Validates an untrusted event payload. Pure — no Prisma, no network — so the
 * API route and the service can share exactly one validation path.
 *
 * Relationship checks (store active, perfume ∈ store) are DB-level and live in
 * the service; this boundary only enforces shape, enum membership and size.
 */
export function validateAnalyticsEvent(input: unknown): AnalyticsEventValidation {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "event payload must be an object." };
  }

  const record = input as Record<string, unknown>;

  const { eventType } = record;

  if (typeof eventType !== "string" || !(ANALYTICS_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return { ok: false, reason: "unknown eventType." };
  }

  if (!isOptionalId(record.storeId) || !isOptionalId(record.sessionId) || !isOptionalId(record.perfumeId)) {
    return { ok: false, reason: "ids must be opaque 1–64 char strings." };
  }

  let metadata: Record<string, unknown> | undefined;

  if (record.metadata !== undefined) {
    if (typeof record.metadata !== "object" || record.metadata === null || Array.isArray(record.metadata)) {
      return { ok: false, reason: "metadata must be an object when present." };
    }

    metadata = sanitizeMetadata(record.metadata as Record<string, unknown>);

    if (JSON.stringify(metadata).length > ANALYTICS_METADATA_MAX_BYTES) {
      return { ok: false, reason: "metadata exceeds the size limit." };
    }
  }

  return {
    ok: true,
    value: {
      eventType: eventType as AnalyticsEventType,
      storeId: record.storeId,
      sessionId: record.sessionId,
      perfumeId: record.perfumeId,
      metadata,
    },
  };
}
