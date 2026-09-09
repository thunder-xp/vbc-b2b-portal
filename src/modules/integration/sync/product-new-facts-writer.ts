import "server-only";

import { createAdminClient } from "../../../lib/supabase/admin";
import type { OneCProductNewSnapshot } from "../providers/one-c";
import { catalogPersistenceError } from "./catalog-persistence-error";

const BATCH_SIZE = 200;

export type ProductNewFactsPublicationResult = {
  businessDate: string;
  totalProducts: number;
  withSourceCreatedAt: number;
  withoutSourceCreatedAt: number;
  invalidSourceCreatedAt: number;
  withMarketEntryAt: number;
  withoutMarketEntryAt: number;
  marketEntryBeforeCreationAnomalies: number;
  futureMarketEntryCount: number;
  new30: number;
  new60: number;
  new90: number;
  new365: number;
  automatedNewActivated: boolean;
};

export interface ProductNewFactsWriter {
  publish(syncId: string, snapshot: OneCProductNewSnapshot, catalogPageCount: number): Promise<ProductNewFactsPublicationResult>;
}

export class SupabaseProductNewFactsWriter implements ProductNewFactsWriter {
  async publish(syncId: string, snapshot: OneCProductNewSnapshot, catalogPageCount: number) {
    const client = createAdminClient();
    const { error: clearError } = await client.from("catalog_product_new_sync_stage").delete().eq("sync_id", syncId);
    if (clearError) throw catalogPersistenceError("automated_new_staging", clearError);

    try {
      for (const [batchIndex, batch] of chunks(snapshot.facts, BATCH_SIZE).entries()) {
        const { error } = await client.from("catalog_product_new_sync_stage").insert(batch.map((fact) => ({
          sync_id: syncId,
          product_external_1c_id: fact.productExternalId,
          source_created_at: fact.sourceCreatedAt,
          market_entry_at: fact.marketEntryAt,
          market_entry_source_ref: fact.marketEntryReceiptRef,
          eligible_receipt_count: fact.eligibleReceiptCount,
          source_status: fact.sourceStatus,
        })));
        if (error) throw catalogPersistenceError("automated_new_staging", error, batchIndex + 1, batch.length);
      }

      const { data, error } = await client.rpc("publish_catalog_product_new_facts", {
        p_sync_id: syncId,
        p_business_date: snapshot.businessDate,
        p_total_catalog_products: snapshot.totalCatalogProducts,
        p_total_creation_requisite_rows: snapshot.totalCreationRequisiteRows,
        p_total_eligible_receipts: snapshot.totalEligibleReceipts,
        p_total_eligible_receipt_lines: snapshot.totalEligibleReceiptLines,
        p_catalog_page_count: catalogPageCount,
        p_creation_requisite_page_count: snapshot.creationRequisitePageCount,
        p_receipt_header_page_count: snapshot.receiptHeaderPageCount,
        p_receipt_line_page_count: snapshot.receiptLinePageCount,
      });
      if (error) throw catalogPersistenceError("automated_new_publication", error, undefined, snapshot.facts.length);
      return parsePublicationResult(data);
    } finally {
      await client.from("catalog_product_new_sync_stage").delete().eq("sync_id", syncId);
    }
  }
}

function parsePublicationResult(value: unknown): ProductNewFactsPublicationResult {
  if (!isRecord(value)) throw new Error("Automated NEW publication returned an invalid result.");
  const requiredNumbers = ["totalProducts", "withSourceCreatedAt", "withoutSourceCreatedAt", "invalidSourceCreatedAt", "withMarketEntryAt", "withoutMarketEntryAt", "marketEntryBeforeCreationAnomalies", "futureMarketEntryCount", "new30", "new60", "new90", "new365"] as const;
  if (typeof value.businessDate !== "string" || typeof value.automatedNewActivated !== "boolean" || requiredNumbers.some((key) => typeof value[key] !== "number")) {
    throw new Error("Automated NEW publication returned an invalid result.");
  }
  return value as ProductNewFactsPublicationResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}
