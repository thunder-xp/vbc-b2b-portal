import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  GlobalOrderHistoryCheckpoint,
  GlobalOrderHistoryRepository,
  GlobalOrderHistorySyncSummary,
} from "../global-order-history.repository";
import { GlobalOrderHistoryRepositoryError } from "../global-order-history.repository";

type Row = Record<string, unknown>;

export class SupabaseGlobalOrderHistoryRepository implements GlobalOrderHistoryRepository {
  async acquire(restart = false): Promise<GlobalOrderHistoryCheckpoint> {
    const { data, error } = await createAdminClient().rpc(
      "acquire_partner_order_history_global_sync",
      { p_restart: restart, p_stale_after_seconds: 600 },
    );
    if (error || !isRecord(data)) throw new GlobalOrderHistoryRepositoryError();
    const status = text(data.status);
    if (status === "locked" || status === "completed") {
      return { status, phase: status === "completed" ? "completed" : null, lockToken: null, headerCursor: "0", itemCursor: "0" };
    }
    const phase = text(data.phase);
    if ((phase !== "headers" && phase !== "items") || !text(data.lockToken)) {
      throw new GlobalOrderHistoryRepositoryError();
    }
    return {
      status: "running",
      phase,
      lockToken: text(data.lockToken),
      headerCursor: text(data.headerCursor) || "0",
      itemCursor: text(data.itemCursor) || "0",
    };
  }

  async persistHeaderPage(input: Parameters<GlobalOrderHistoryRepository["persistHeaderPage"]>[0]) {
    const { data, error } = await createAdminClient().rpc(
      "persist_partner_order_history_global_header_page",
      {
        p_lock_token: input.lockToken,
        p_cursor: input.cursor,
        p_next_cursor: input.nextCursor,
        p_has_more: input.hasMore,
        p_headers: input.headers.map((header) => ({
          external_1c_order_ref: header.reference.externalId,
          external_1c_order_number: header.number,
          one_c_document_date: header.documentDate,
          one_c_delivery_date: header.requestedDeliveryDate,
          one_c_posted: header.posted,
          one_c_deletion_mark: header.deletionMark,
          one_c_state_ref: header.stateReference?.externalId ?? null,
          one_c_state_raw: header.stateRaw,
          one_c_state_code: header.stateCode === "unknown" ? null : header.stateCode,
          one_c_source_version: header.sourceVersion,
          external_contract_ref: header.contractReference?.externalId ?? null,
          external_currency_ref: header.currencyReference?.externalId ?? null,
          document_total: header.documentTotal,
          currency_code: header.currencyCode,
          source_counterparty_1c_id: header.partnerCompanyReference.externalId,
          source_counterparty_type_code: header.sourceCounterpartyTypeCode,
          source_government_body_type_code: header.sourceGovernmentBodyTypeCode,
          source_operation_code: header.sourceOperationCode,
        })),
        p_counterparty_metrics: input.counterpartyMetrics,
      },
    );
    if (error || !isRecord(data)) throw new GlobalOrderHistoryRepositoryError();
    const nextPhase = text(data.nextPhase);
    if (nextPhase !== "headers" && nextPhase !== "items") throw new GlobalOrderHistoryRepositoryError();
    return {
      inserted: number(data.inserted), updated: number(data.updated),
      eligible: number(data.eligible), nextPhase: nextPhase as "headers" | "items",
    };
  }

  async persistItemPage(input: Parameters<GlobalOrderHistoryRepository["persistItemPage"]>[0]) {
    const { data, error } = await createAdminClient().rpc(
      "persist_partner_order_history_global_item_page",
      {
        p_lock_token: input.lockToken,
        p_cursor: input.cursor,
        p_next_cursor: input.nextCursor,
        p_has_more: input.hasMore,
        p_items: input.items.map((item) => ({
          external_1c_order_ref: item.orderReference.externalId,
          line_number: item.lineNumber,
          external_product_ref: item.productReference.externalId,
          external_characteristic_ref: item.characteristicReference?.externalId ?? null,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          line_total: item.lineTotal,
        })),
      },
    );
    if (error || !isRecord(data)) throw new GlobalOrderHistoryRepositoryError();
    return { upserted: number(data.upserted), eligible: number(data.eligible), completed: data.completed === true };
  }

  async release(lockToken: string): Promise<void> {
    const { data, error } = await createAdminClient().rpc(
      "release_partner_order_history_global_sync", { p_lock_token: lockToken },
    );
    if (error || data !== true) throw new GlobalOrderHistoryRepositoryError();
  }

  async fail(lockToken: string, safeError: string): Promise<void> {
    const { error } = await createAdminClient().rpc(
      "fail_partner_order_history_global_sync",
      { p_lock_token: lockToken, p_safe_error: safeError },
    );
    if (error) throw new GlobalOrderHistoryRepositoryError();
  }

  async getSummary(): Promise<GlobalOrderHistorySyncSummary> {
    const { data, error } = await createAdminClient().rpc(
      "get_partner_order_history_global_sync_state",
    );
    if (error || !isRecord(data)) throw new GlobalOrderHistoryRepositoryError();
    return {
      status: text(data.status), phase: text(data.phase),
      headerPages: number(data.header_pages), itemPages: number(data.item_pages),
      headersScanned: number(data.headers_scanned), itemsScanned: number(data.items_scanned),
      eligibleB2bOrders: number(data.eligible_b2b_orders), eligibleB2bItems: number(data.eligible_b2b_items),
      ordersInserted: number(data.orders_inserted), ordersUpdated: number(data.orders_updated),
      itemsUpserted: number(data.items_upserted),
      sourceOldestOrder: nullable(data.source_oldest_order), sourceNewestOrder: nullable(data.source_newest_order),
      startedAt: nullable(data.started_at), completedAt: nullable(data.completed_at), lastError: nullable(data.last_error),
    };
  }
}

function isRecord(value: unknown): value is Row { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullable(value: unknown): string | null { return typeof value === "string" ? value : null; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
