import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { SalesOrderHistoryDTO } from "../../../integration/dto";
import type {
  PartnerOrderHistory,
  PartnerOrderHistoryEvent,
  PartnerOrderHistoryItem,
  PartnerOrderHistorySyncState,
} from "../../types";
import {
  OrderHistoryRepositoryError,
  type PartnerOrderHistoryRepository,
} from "../order-history.repository";

const HISTORY_COLUMNS = "id, company_id, portal_order_id, external_1c_order_ref, external_1c_order_number, one_c_posted, one_c_deletion_mark, one_c_state_ref, one_c_state_raw, one_c_state_code, one_c_document_date, one_c_delivery_date, one_c_source_version, one_c_last_synced_at, external_contract_ref, external_currency_ref, document_total, currency_code, origin_type, partner_visible, hidden_reason, position_count, total_unit_count, created_at, updated_at";
const ITEM_COLUMNS = "id, order_history_id, line_number, product_id, external_product_ref, external_characteristic_ref, product_name, sku, quantity, unit_price, line_total, currency_code";
const EVENT_COLUMNS = "id, order_history_id, event_type, occurred_at, previous_value, current_value";

type Row = Record<string, unknown>;

export class SupabasePartnerOrderHistoryRepository implements PartnerOrderHistoryRepository {
  async listVisible(input: Parameters<PartnerOrderHistoryRepository["listVisible"]>[0]): Promise<{ items: PartnerOrderHistory[]; total: number }> {
    let query = (await createClient()).from("partner_order_history").select(HISTORY_COLUMNS, { count: "exact" })
      .eq("company_id", input.companyId).eq("partner_visible", true)
      .order("one_c_document_date", { ascending: false }).order("id", { ascending: true });
    if (input.filter === "processing") query = query.eq("one_c_posted", false);
    else if (input.filter !== "all") query = query.eq("one_c_posted", true).eq("one_c_state_code", input.filter);
    if (input.search) query = query.eq("one_c_posted", true).ilike("external_1c_order_number", `%${escapeLike(input.search)}%`);
    const from = (input.page - 1) * input.pageSize;
    const { data, error, count } = await query.range(from, from + input.pageSize - 1);
    if (error) throw new OrderHistoryRepositoryError();
    return { items: ((data ?? []) as Row[]).map(mapHistory), total: count ?? 0 };
  }

  async findVisibleById(orderId: string): Promise<PartnerOrderHistory | null> {
    const { data, error } = await (await createClient()).from("partner_order_history").select(HISTORY_COLUMNS)
      .eq("id", orderId).eq("partner_visible", true).maybeSingle();
    if (error) throw new OrderHistoryRepositoryError();
    return data ? mapHistory(data as Row) : null;
  }

  async listItemsByOrderIds(orderIds: string[]): Promise<PartnerOrderHistoryItem[]> {
    if (!orderIds.length) return [];
    const { data, error } = await (await createClient()).from("partner_order_history_items").select(ITEM_COLUMNS)
      .in("order_history_id", orderIds).order("line_number");
    if (error) throw new OrderHistoryRepositoryError();
    return ((data ?? []) as Row[]).map(mapItem);
  }

  async listEvents(orderId: string): Promise<PartnerOrderHistoryEvent[]> {
    const { data, error } = await (await createClient()).from("partner_order_history_events").select(EVENT_COLUMNS)
      .eq("order_history_id", orderId).eq("internal_only", false).order("occurred_at").order("id");
    if (error) throw new OrderHistoryRepositoryError();
    return ((data ?? []) as Row[]).map(mapEvent);
  }

  async getSyncState(companyId: string): Promise<PartnerOrderHistorySyncState | null> {
    const { data, error } = await (await createClient()).from("partner_order_history_sync_state").select("*")
      .eq("company_id", companyId).maybeSingle();
    if (error) throw new OrderHistoryRepositoryError();
    return data ? mapSyncState(data as Row) : null;
  }

  async startSync(input: Parameters<PartnerOrderHistoryRepository["startSync"]>[0]): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await createAdminClient().from("partner_order_history_sync_state").upsert({
      company_id: input.companyId,
      counterparty_ref: input.counterpartyRef,
      status: "running",
      sync_mode: input.mode,
      active_sync_id: input.syncId,
      safe_error: null,
      records_received: 0,
      records_inserted: 0,
      records_updated: 0,
      records_hidden: 0,
      started_at: now,
      finished_at: null,
      updated_at: now,
    }, { onConflict: "company_id" });
    if (error) throw new OrderHistoryRepositoryError();
  }

  async upsertBatch(input: Parameters<PartnerOrderHistoryRepository["upsertBatch"]>[0]) {
    const rpcName = "upsert_partner_order_history_batch";
    const { data, error } = await createAdminClient().rpc("upsert_partner_order_history_batch", {
      target_company_id: input.companyId,
      target_sync_id: input.syncId,
      target_synced_at: input.syncedAt,
      target_orders: input.orders.map(toPersistenceOrder),
    });
    if (error || !isRecord(data)) {
      console.error({
        event: "partner_order_history_rpc_failed",
        rpcName,
        syncId: input.syncId,
        companyId: input.companyId,
        orderCount: input.orders.length,
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
        errorDetails: error?.details ?? null,
        errorHint: error?.hint ?? null,
        resultShape: isRecord(data) ? Object.keys(data) : typeof data,
      });
      throw new OrderHistoryRepositoryError();
    }
    return {
      inserted: numberValue(data.inserted),
      updated: numberValue(data.updated),
      hidden: numberValue(data.hidden),
    };
  }

  async completeSync(input: Parameters<PartnerOrderHistoryRepository["completeSync"]>[0]): Promise<void> {
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      status: "succeeded",
      active_sync_id: null,
      last_source_version: input.lastSourceVersion,
      safe_error: null,
      records_received: input.received,
      records_inserted: input.inserted,
      records_updated: input.updated,
      records_hidden: input.hidden,
      finished_at: now,
      updated_at: now,
    };
    payload[input.mode === "full" ? "last_successful_full_sync_at" : "last_incremental_sync_at"] = now;
    const { error } = await createAdminClient().from("partner_order_history_sync_state").update(payload)
      .eq("company_id", input.companyId).eq("active_sync_id", input.syncId);
    if (error) throw new OrderHistoryRepositoryError();
  }

  async failSync(input: Parameters<PartnerOrderHistoryRepository["failSync"]>[0]): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await createAdminClient().from("partner_order_history_sync_state").update({
      status: "failed",
      active_sync_id: null,
      safe_error: input.safeError,
      finished_at: now,
      updated_at: now,
    }).eq("company_id", input.companyId).eq("active_sync_id", input.syncId);
    if (error) throw new OrderHistoryRepositoryError();
  }
}

function toPersistenceOrder(order: SalesOrderHistoryDTO) {
  return {
    external_1c_order_ref: order.reference.externalId,
    external_1c_order_number: order.number,
    one_c_posted: order.posted,
    one_c_deletion_mark: order.deletionMark,
    one_c_state_ref: order.stateReference?.externalId ?? null,
    one_c_state_raw: order.stateRaw,
    one_c_state_code: order.stateCode === "unknown" ? null : order.stateCode,
    one_c_document_date: order.documentDate,
    one_c_delivery_date: order.requestedDeliveryDate,
    one_c_source_version: order.sourceVersion,
    external_contract_ref: order.contractReference?.externalId ?? null,
    external_currency_ref: order.currencyReference?.externalId ?? null,
    document_total: order.documentTotal,
    currency_code: order.currencyCode,
    position_count: order.items.length,
    total_unit_count: order.items.reduce((sum, item) => sum + item.quantity, 0),
    items: order.items.map((item) => ({
      line_number: item.lineNumber,
      external_product_ref: item.productReference.externalId,
      external_characteristic_ref: item.characteristicReference?.externalId ?? null,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.lineTotal,
    })),
  };
}

function mapHistory(row: Row): PartnerOrderHistory {
  return {
    id: text(row.id), companyId: text(row.company_id), portalOrderId: nullableText(row.portal_order_id),
    external1cOrderRef: text(row.external_1c_order_ref), external1cOrderNumber: text(row.external_1c_order_number),
    oneCPosted: row.one_c_posted === true, oneCDeletionMark: row.one_c_deletion_mark === true,
    oneCStateRef: nullableText(row.one_c_state_ref),
    oneCStateRaw: nullableText(row.one_c_state_raw), oneCStateCode: row.one_c_state_code as PartnerOrderHistory["oneCStateCode"],
    oneCDocumentDate: text(row.one_c_document_date), oneCDeliveryDate: nullableText(row.one_c_delivery_date),
    oneCSourceVersion: nullableText(row.one_c_source_version), oneCLastSyncedAt: text(row.one_c_last_synced_at),
    externalContractRef: nullableText(row.external_contract_ref), externalCurrencyRef: nullableText(row.external_currency_ref),
    documentTotal: numberValue(row.document_total), currencyCode: nullableText(row.currency_code),
    originType: row.origin_type as PartnerOrderHistory["originType"], partnerVisible: row.partner_visible === true,
    hiddenReason: nullableText(row.hidden_reason), positionCount: numberValue(row.position_count),
    totalUnitCount: numberValue(row.total_unit_count), createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  };
}

function mapItem(row: Row): PartnerOrderHistoryItem {
  return {
    id: text(row.id), orderHistoryId: text(row.order_history_id), lineNumber: numberValue(row.line_number),
    productId: nullableText(row.product_id), externalProductRef: text(row.external_product_ref),
    externalCharacteristicRef: nullableText(row.external_characteristic_ref), productName: nullableText(row.product_name),
    sku: nullableText(row.sku), quantity: numberValue(row.quantity), unitPrice: numberValue(row.unit_price),
    lineTotal: numberValue(row.line_total), currencyCode: nullableText(row.currency_code),
  };
}

function mapEvent(row: Row): PartnerOrderHistoryEvent {
  return {
    id: text(row.id), orderHistoryId: text(row.order_history_id),
    eventType: row.event_type as PartnerOrderHistoryEvent["eventType"], occurredAt: text(row.occurred_at),
    previousValue: nullableText(row.previous_value), currentValue: nullableText(row.current_value),
  };
}

function mapSyncState(row: Row): PartnerOrderHistorySyncState {
  return {
    companyId: text(row.company_id), counterpartyRef: text(row.counterparty_ref),
    status: row.status as PartnerOrderHistorySyncState["status"], syncMode: row.sync_mode as PartnerOrderHistorySyncState["syncMode"],
    activeSyncId: nullableText(row.active_sync_id), lastSuccessfulFullSyncAt: nullableText(row.last_successful_full_sync_at),
    lastIncrementalSyncAt: nullableText(row.last_incremental_sync_at), lastSourceVersion: nullableText(row.last_source_version),
    safeError: nullableText(row.safe_error), recordsReceived: numberValue(row.records_received),
    recordsInserted: numberValue(row.records_inserted), recordsUpdated: numberValue(row.records_updated),
    recordsHidden: numberValue(row.records_hidden), startedAt: nullableText(row.started_at), finishedAt: nullableText(row.finished_at),
  };
}

function escapeLike(value: string): string { return value.replace(/[\\%_]/g, "\\$&"); }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown): string | null { return typeof value === "string" ? value : null; }
function numberValue(value: unknown): number { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
