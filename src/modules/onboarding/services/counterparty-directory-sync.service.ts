import "server-only";

import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  CounterpartyDirectoryCounts,
  CounterpartyDirectorySnapshot,
} from "../types";
import { OneCCounterpartyDirectorySource } from "./one-c-counterparty-directory.source";

const BATCH_SIZE = 500;
const STALE_LOCK_HOURS = 2;

export class CounterpartyDirectorySyncService {
  constructor(private readonly source: OneCCounterpartyDirectorySource) {}

  async synchronize(): Promise<CounterpartyDirectoryCounts> {
    const syncId = randomUUID();
    const startedAt = new Date().toISOString();
    const client = createAdminClient();

    await client
      .from("one_c_counterparty_directory_syncs")
      .update({
        status: "failed",
        finished_at: startedAt,
        lock_acquired_at: null,
        safe_error_code: "STALE_LOCK_RECOVERED",
        updated_at: startedAt,
      })
      .eq("status", "running")
      .lt(
        "lock_acquired_at",
        new Date(Date.now() - STALE_LOCK_HOURS * 60 * 60 * 1000).toISOString(),
      );

    const { error: lockError } = await client
      .from("one_c_counterparty_directory_syncs")
      .insert({
        sync_id: syncId,
        status: "running",
        started_at: startedAt,
        lock_acquired_at: startedAt,
      });
    if (lockError) throw new Error("Counterparty directory sync is already running.");

    console.info({
      event: "one_c_counterparty_directory_sync_started",
      syncId,
    });

    try {
      const snapshot = await this.source.load();
      const counts = countSnapshot(snapshot);
      await this.stage(syncId, startedAt, snapshot, counts);
      const { data, error } = await client.rpc(
        "publish_one_c_counterparty_directory",
        { p_sync_id: syncId },
      );
      if (error) throw new Error("Counterparty directory publication failed.");
      const publication = readPublicationCounts(data);
      const result = { ...counts, ...publication };
      console.info({
        event: "one_c_counterparty_directory_sync_succeeded",
        syncId,
        pagesProcessed: snapshot.pagesProcessed,
        sourceCounterparties: result.sourceCounterparties,
        published: result.published,
        portalLinked: result.portalLinked,
        failedRecords: result.failedRecords,
      });
      return result;
    } catch (error) {
      const errorCode = safeErrorCode(error);
      await client
        .from("one_c_counterparty_directory_syncs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          lock_acquired_at: null,
          safe_error_code: errorCode,
          updated_at: new Date().toISOString(),
        })
        .eq("sync_id", syncId);
      console.error({
        event: "one_c_counterparty_directory_sync_failed",
        syncId,
        errorCode,
      });
      throw error;
    }
  }

  private async stage(
    syncId: string,
    synchronizedAt: string,
    snapshot: CounterpartyDirectorySnapshot,
    counts: CounterpartyDirectoryCounts,
  ): Promise<void> {
    const client = createAdminClient();
    for (const batch of chunks(snapshot.counterparties, BATCH_SIZE)) {
      const { error } = await client.from("one_c_counterparties").insert(
        batch.map((row) => ({
          sync_id: syncId,
          external_1c_id: row.external1cId,
          external_code: row.externalCode,
          name: row.name,
          normalized_name: row.normalizedName,
          fiscal_code: row.fiscalCode,
          normalized_fiscal_code: row.normalizedFiscalCode,
          is_active: row.isActive,
          is_deleted: row.isDeleted,
          phone: row.phone,
          normalized_phone: row.normalizedPhone,
          email: row.email,
          normalized_email: row.normalizedEmail,
          locality: row.locality,
          assigned_manager_external_id: row.assignedManagerExternalId,
          assigned_manager_name: row.assignedManagerName,
          synchronization_version: syncId,
          source_updated_at: row.sourceUpdatedAt,
          synchronized_at: synchronizedAt,
        })),
      );
      if (error) throw new Error("Counterparty directory staging failed.");
    }
    for (const batch of chunks(snapshot.contracts, BATCH_SIZE)) {
      const { error } = await client.from("one_c_counterparty_contracts").insert(
        batch.map((row) => ({
          sync_id: syncId,
          counterparty_external_1c_id: row.counterpartyExternal1cId,
          external_1c_id: row.external1cId,
          code: row.code,
          name: row.name,
          price_type_external_1c_id: row.priceTypeExternal1cId,
          is_active: row.isActive,
          is_deleted: row.isDeleted,
          synchronized_at: synchronizedAt,
        })),
      );
      if (error) throw new Error("Counterparty contract staging failed.");
    }
    for (const batch of chunks(snapshot.priceProfiles, BATCH_SIZE)) {
      const { error } = await client
        .from("one_c_counterparty_price_profiles")
        .insert(
          batch.map((row) => ({
            sync_id: syncId,
            counterparty_external_1c_id: row.counterpartyExternal1cId,
            external_1c_id: row.external1cId,
            code: row.code,
            name: row.name,
            is_active: row.isActive,
            is_deleted: row.isDeleted,
            synchronized_at: synchronizedAt,
          })),
        );
      if (error) throw new Error("Counterparty price-profile staging failed.");
    }

    const { error } = await client
      .from("one_c_counterparty_directory_syncs")
      .update({
        source_counterparties: counts.sourceCounterparties,
        active_counterparties: counts.active,
        inactive_counterparties: counts.inactive,
        deleted_counterparties: counts.deleted,
        with_fiscal_code: counts.withFiscalCode,
        without_fiscal_code: counts.withoutFiscalCode,
        duplicate_fiscal_codes: counts.duplicateFiscalCodes,
        contracts: counts.contracts,
        price_type_relationships: counts.priceTypeRelationships,
        unresolved_manager_references: counts.unresolvedManagerReferences,
        failed_records: counts.failedRecords,
        updated_at: new Date().toISOString(),
      })
      .eq("sync_id", syncId);
    if (error) throw new Error("Counterparty directory sync state update failed.");
  }
}

export function countSnapshot(
  snapshot: CounterpartyDirectorySnapshot,
): CounterpartyDirectoryCounts {
  const fiscalCounts = new Map<string, number>();
  for (const row of snapshot.counterparties) {
    if (row.normalizedFiscalCode) {
      fiscalCounts.set(
        row.normalizedFiscalCode,
        (fiscalCounts.get(row.normalizedFiscalCode) ?? 0) + 1,
      );
    }
  }
  return {
    sourceCounterparties: snapshot.counterparties.length,
    active: snapshot.counterparties.filter((row) => row.isActive).length,
    inactive: snapshot.counterparties.filter(
      (row) => !row.isActive && !row.isDeleted,
    ).length,
    deleted: snapshot.counterparties.filter((row) => row.isDeleted).length,
    withFiscalCode: snapshot.counterparties.filter(
      (row) => row.normalizedFiscalCode !== null,
    ).length,
    withoutFiscalCode: snapshot.counterparties.filter(
      (row) => row.normalizedFiscalCode === null,
    ).length,
    duplicateFiscalCodes: [...fiscalCounts.values()].filter((count) => count > 1)
      .length,
    contracts: snapshot.contracts.length,
    priceTypeRelationships: snapshot.priceProfiles.length,
    portalLinked: 0,
    unresolvedManagerReferences: snapshot.counterparties.filter(
      (row) => row.assignedManagerExternalId && !row.assignedManagerName,
    ).length,
    published: 0,
    failedRecords: snapshot.failedRecords,
  };
}

function chunks<T>(rows: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }
  return result;
}

function readPublicationCounts(
  value: unknown,
): Pick<CounterpartyDirectoryCounts, "published" | "portalLinked"> {
  if (
    typeof value === "object" &&
    value !== null &&
    "published" in value &&
    typeof value.published === "number" &&
    "portalLinked" in value &&
    typeof value.portalLinked === "number"
  ) {
    return {
      published: value.published,
      portalLinked: value.portalLinked,
    };
  }
  throw new Error("Counterparty directory publication result is invalid.");
}

function safeErrorCode(error: unknown): string {
  return error instanceof Error
    ? error.name.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").slice(0, 80)
    : "UNKNOWN_SYNC_FAILURE";
}
