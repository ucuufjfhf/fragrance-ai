import { describe, expect, it } from "vitest";

import {
  BULK_ITEM_STATUSES,
  BULK_JOB_STATUSES,
} from "@/lib/admin/bulk/contract";
import { BulkProfileItemStatus, BulkProfileJobStatus } from "@/lib/generated/prisma/enums";
import type {
  BulkProfileItem,
  BulkProfileJob,
  FragranceProfile,
} from "@/lib/generated/prisma/client";

/**
 * Phase 12.2 schema tests — Prisma metadata only, no live database.
 *
 * The one real drift risk between the Phase 12.1 TS contract and the Phase
 * 12.2 migration is enum divergence, so these tests pin the generated client
 * enums against the contract arrays in both directions, plus the model shape
 * the Phase 12.3 service will rely on.
 */

describe("Phase 12.2 — bulk profile schema metadata", () => {
  it("generated job-status enum matches the Phase 12.1 contract exactly", () => {
    expect(Object.values(BulkProfileJobStatus).sort()).toEqual(
      [...BULK_JOB_STATUSES].sort(),
    );
  });

  it("generated item-status enum matches the Phase 12.1 contract exactly", () => {
    expect(Object.values(BulkProfileItemStatus).sort()).toEqual(
      [...BULK_ITEM_STATUSES].sort(),
    );
  });

  it("generated enums carry no extra states beyond the contract", () => {
    expect(Object.values(BulkProfileJobStatus)).toHaveLength(BULK_JOB_STATUSES.length);
    expect(Object.values(BulkProfileItemStatus)).toHaveLength(BULK_ITEM_STATUSES.length);
  });

  it("generated model types expose the Phase 12.2 field shapes", () => {
    // Compile-time pins: required fields, nullable fields and enum-typed
    // status columns. A schema regression (e.g. making heartbeatAt required)
    // fails `npm run typecheck`, not just this suite.
    const jobShape: {
      statusIsEnum: BulkProfileJob["status"] extends BulkProfileJobStatus ? true : never;
      startedAtNullable: null extends BulkProfileJob["startedAt"] ? true : never;
      completedAtNullable: null extends BulkProfileJob["completedAt"] ? true : never;
      countsAreNumbers: BulkProfileJob["successCount"] extends number ? true : never;
    } = { statusIsEnum: true, startedAtNullable: true, completedAtNullable: true, countsAreNumbers: true };

    const itemShape: {
      statusIsEnum: BulkProfileItem["status"] extends BulkProfileItemStatus ? true : never;
      rowNumberNullable: null extends BulkProfileItem["rowNumber"] ? true : never;
      errorCodeNullable: null extends BulkProfileItem["errorCode"] ? true : never;
      errorMessageNullable: null extends BulkProfileItem["errorMessage"] ? true : never;
      heartbeatAtNullable: null extends BulkProfileItem["heartbeatAt"] ? true : never;
      attemptsIsNumber: BulkProfileItem["attempts"] extends number ? true : never;
    } = {
      statusIsEnum: true,
      rowNumberNullable: true,
      errorCodeNullable: true,
      errorMessageNullable: true,
      heartbeatAtNullable: true,
      attemptsIsNumber: true,
    };

    expect(jobShape.statusIsEnum).toBe(true);
    expect(itemShape.statusIsEnum).toBe(true);
  });

  it("FragranceProfile was NOT extended with aiEnrichedAt (approved decision)", () => {
    type HasAiEnrichedAt = "aiEnrichedAt" extends keyof FragranceProfile ? true : false;
    const marker: HasAiEnrichedAt = false;
    expect(marker).toBe(false);
  });
});
