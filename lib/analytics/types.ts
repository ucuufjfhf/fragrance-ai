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
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/** Hard cap on the serialized metadata JSON — analytics is not a data store. */
export const ANALYTICS_METADATA_MAX_BYTES = 1024;

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

    metadata = record.metadata as Record<string, unknown>;

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
