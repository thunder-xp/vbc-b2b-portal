import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { SalesOrderHistoryDTO } from "../../../integration/dto";
import type {
  PartnerOrderHistory,
  PartnerOrderHistoryEvent,
  PartnerOrderHistoryItem,
  PartnerOrderHistorySyncState,
  OrderReorderSource,
} from "../../types";
import {
  OrderHistoryRepositoryError,
  type PartnerOrderHistoryRepository,
} from "../order-history.repository";

const HISTORY_COLUMNS = "id, company_id, portal_order_id, external_1c_order_ref, external_1c_order_number, one_c_posted, one_c_deletion_mark, one_c_state_ref, one_c_state_raw, one_c_state_code, one_c_document_date, one_c_delivery_date, one_c_source_version, one_c_last_synced_at, external_contract_ref, external_currency_ref, document_total, currency_code, origin_type, partner_visible, hidden_reason, position_count, total_unit_count, created_at, updated_at";
const ITEM_COLUMNS = "id, order_history_id, line_number, product_id, external_product_ref, external_characteristic_ref, product_name, sku, quantity, unit_price, line_total, currency_code";
const EVENT_COLUMNS = "id, order_history_id, event_type, occurred_at, previous_value, current_value";
const SYNC_COLUMNS = "company_id, counterparty_ref, status, sync_mode, active_sync_id, last_successful_full_sync_at, last_incremental_sync_at, last_source_version, safe_error, records_received, records_inserted, records_updated, records_hidden, started_at, finished_at, updated_at";

type Row = Record<string, unknown>;

export class SupabasePartnerOrderHistoryRepository implements PartnerOrderHistoryRepository {
  async getReorderSource(orderId: string): Promise<OrderReorderSource | null> {
    const { data, error } = await (await createClient()).rpc("get_partner_order_reorder_source", {
      target_order_id: orderId,
    });
    if (error) throw new OrderHistoryRepositoryError();
    if (!isRecord(data)) return null;
    const order = isRecord(data.order) ? data.order : null;
    const lines = Array.isArray(data.lines) ? data.lines.filter(isRecord) : [];
    if (!order) return null;
    return {
      orderId: text(order.id),
      companyId: text(order.company_id),
      orderNumber: text(order.external_1c_order_number),
      orderCurrencyCode: nullableText(order.currency_code),
      lines: lines.map((line) => ({
        lineId: text(line.line_id),
        lineNumber: numberValue(line.line_number),
        productId: nullableText(line.product_id),
        historicalExternalProductRef: text(line.historical_external_product_ref),
        historicalProductName: nullableText(line.historical_product_name),
        historicalSku: nullableText(line.historical_sku),
        historicalQuantity: numberValue(line.historical_quantity),
        historicalUnitPrice: numberValue(line.historical_unit_price),
        historicalCurrencyCode: nullableText(line.historical_currency_code),
        productExists: line.product_exists === true,
        currentExternalProductRef: nullableText(line.current_external_product_ref),
        currentName: nullableText(line.current_name),
        currentSku: nullableText(line.current_sku),
        currentSlug: nullableText(line.current_slug),
        currentImageUrl: nullableText(line.current_image_url),
        currentCategoryId: nullableText(line.current_category_id),
        currentIsActive: line.current_is_active === true,
        currentIsVisible: line.current_is_visible === true,
      })),
    };
  }

  async listPlannedShipments(input: { companyId: string; page: number; pageSize: number }): Promise<{ items: PartnerOrderHistory[]; total: number }> {
    const from = (input.page - 1) * input.pageSize;
    const { data, error, count } = await (await createClient()).from("partner_order_history")
      .select(HISTORY_COLUMNS, { count: "exact" })
      .eq("company_id", input.companyId)
      .eq("partner_visible", true)
      .eq("one_c_deletion_mark", false)
      .not("one_c_delivery_date", "is", null)
      .or("one_c_state_code.is.null,one_c_state_code.neq.completed")
      .order("one_c_delivery_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + input.pageSize - 1);
    if (error) throw new OrderHistoryRepositoryError();
    return { items: ((data ?? []) as Row[]).map(mapHistory), total: count ?? 0 };
  }

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
    const { data, error } = await (await createClient()).from("partner_order_history_sync_state").select(SYNC_COLUMNS)
      .eq("company_id", companyId).maybeSingle();
    if (error) throw new OrderHistoryRepositoryError();
    return data ? mapSyncState(data as Row) : null;
  }

  async getSyncStateForAutomation(companyId: string): Promise<PartnerOrderHistorySyncState | null> {
    const { data, error } = await createAdminClient().from("partner_order_history_sync_state").select(SYNC_COLUMNS)
      .eq("company_id", companyId).maybeSingle();
    if (error) {
      console.error({
        event: "partner_order_history_automation_state_read_failed",
        companyId,
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw new OrderHistoryRepositoryError();
    }
    return data ? mapSyncState(data as Row) : null;
  }

  async startSync(input: Parameters<PartnerOrderHistoryRepository["startSync"]>[0]) {
    const { data, error } = await createAdminClient().rpc("acquire_partner_order_history_sync", {
      p_company_id: input.companyId,
      p_counterparty_ref: input.counterpartyRef,
      p_sync_id: input.syncId,
      p_mode: input.mode,
      p_stale_after_seconds: 7200,
    });
    if (error || (data !== "acquired" && data !== "locked" && data !== "stale_lock_recovered")) throw new OrderHistoryRepositoryError();
    return data;
  }

  async listSyncCompanies(limit: number) {
    const { data, error } = await createAdminClient().from("partner_companies")
      .select("id,external_1c_id").eq("status", "active").not("external_1c_id", "is", null)
      .order("id").limit(Math.max(1, Math.min(limit, 100)));
    if (error) throw new OrderHistoryRepositoryError();
    return (data ?? []).flatMap((row) => typeof row.external_1c_id === "string" && row.external_1c_id.trim()
      ? [{ companyId: row.id, counterpartyRef: row.external_1c_id.trim() }]
      : []);
  }

  async listActiveRefreshCandidates(input: { olderThan: string; limit: number }) {
    const { data, error } = await createAdminClient().from("partner_order_history")
      .select(`${HISTORY_COLUMNS},partner_companies!inner(external_1c_id)`)
      .eq("partner_visible", true).eq("one_c_deletion_mark", false)
      .or("one_c_posted.eq.false,one_c_state_code.is.null,one_c_state_code.neq.completed")
      .lt("one_c_last_synced_at", input.olderThan)
      .order("one_c_last_synced_at", { ascending: true }).order("id", { ascending: true })
      .limit(Math.max(1, Math.min(input.limit, 25)));
    if (error) throw new OrderHistoryRepositoryError();
    return ((data ?? []) as Row[]).flatMap((row) => {
      const company = row.partner_companies;
      const counterpartyRef = isRecord(company) ? nullableText(company.external_1c_id) : null;
      return counterpartyRef ? [{ order: mapHistory(row), counterpartyRef }] : [];
    });
  }

  async touchSynchronizedOrders(input: { companyId: string; orderRefs: string[]; syncedAt: string }): Promise<number> {
    if (!input.orderRefs.length) return 0;
    const { data, error } = await createAdminClient().rpc("touch_partner_order_history_refs", {
      p_company_id: input.companyId,
      p_order_refs: input.orderRefs,
      p_synced_at: input.syncedAt,
    });
    if (error) throw new OrderHistoryRepositoryError();
    return numberValue(data);
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
