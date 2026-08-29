import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { resolveProductImageFit } from "@/src/modules/catalog/components/product-image-source";
import type { PartnerDocumentListItem } from "@/src/modules/documents/types";

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

const HISTORY_COLUMNS = "id, company_id, portal_order_id, external_1c_order_ref, external_1c_order_number, one_c_posted, one_c_deletion_mark, one_c_state_ref, one_c_state_raw, one_c_state_code, one_c_document_date, one_c_delivery_date, one_c_source_version, one_c_last_synced_at, last_existence_verified_at, last_existence_result, external_contract_ref, external_currency_ref, document_total, currency_code, origin_type, partner_visible, hidden_reason, position_count, total_unit_count, created_at, updated_at";
const ITEM_COLUMNS = "id, order_history_id, line_number, product_id, external_product_ref, external_characteristic_ref, product_name, sku, quantity, unit_price, line_total, currency_code";
const EVENT_COLUMNS = "id, order_history_id, event_type, occurred_at, previous_value, current_value";
const SYNC_COLUMNS = "company_id, counterparty_ref, status, sync_mode, active_sync_id, last_successful_full_sync_at, last_incremental_sync_at, last_source_version, incremental_date_watermark, integrity_state, last_successful_full_audit_at, full_audit_requested_at, safe_error, records_received, records_inserted, records_updated, records_hidden, started_at, finished_at, updated_at";

type Row = Record<string, unknown>;

export class SupabasePartnerOrderHistoryRepository implements PartnerOrderHistoryRepository {
  async getDetailAggregate(orderId: string) {
    const startedAt = performance.now();
    const { data, error } = await (await createClient()).rpc(
      "get_partner_order_detail_v2",
      { p_order_id: orderId, p_event_limit: 100, p_document_limit: 20 },
    );
    if (error) throw new OrderHistoryRepositoryError();
    if (!isRecord(data)) return null;

    const order = isRecord(data.order) ? data.order : null;
    if (!order) return null;
    const portalSnapshot = isRecord(data.portal_snapshot)
      ? data.portal_snapshot
      : null;

    const aggregate = {
      order: mapHistory(order),
      companyName: text(data.company_name),
      canViewPartnerPrice: data.can_view_partner_price === true,
      items: records(data.items).map(mapItem),
      events: records(data.events).map(mapEvent),
      portalSnapshot: portalSnapshot ? {
        documentTotal: nullableNumber(portalSnapshot.document_total),
        currencyCode: nullableText(portalSnapshot.currency_code),
        items: records(portalSnapshot.items).map((item) => ({
          productId: text(item.product_id),
          productName: text(item.product_name),
          sku: text(item.sku),
          quantity: numberValue(item.quantity),
          partnerUnitPrice: nullableNumber(item.partner_unit_price),
          lineTotal: nullableNumber(item.line_total),
          currencyCode: nullableText(item.currency_code),
        })),
      } : null,
      productReferences: records(data.products).map((product) => {
        const thumbnail = nullableText(product.thumbnail);
        return {
          productId: text(product.product_id),
          slug: text(product.slug),
          sku: text(product.sku),
          name: text(product.name),
          thumbnail,
          thumbnailFit: resolveProductImageFit(thumbnail),
          publicationState: "published" as const,
        };
      }),
      documents: records(data.documents).map(mapDocument),
    };
    console.info(JSON.stringify({
      event: "partner_order_detail_aggregate_loaded",
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      lineCount: aggregate.items.length,
      historyEventCount: aggregate.events.length,
      documentCount: aggregate.documents.length,
      productReferenceCount: aggregate.productReferences.length,
      databaseCallCount: 1,
    }));
    return aggregate;
  }

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
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const from = input.offset ?? (page - 1) * pageSize;
    const limit = input.limit ?? pageSize;
    const { data, error } = await (await createClient()).rpc("get_partner_order_history_page", {
      p_company_id: input.companyId,
      p_filter: input.filter,
      p_search: input.search,
      p_offset: from,
      p_limit: limit,
    });
    if (error || !isRecord(data) || !Array.isArray(data.items)) throw new OrderHistoryRepositoryError();
    return {
      items: (data.items as Row[]).map(mapHistory),
      total: numberValue(data.total),
    };
  }

  async listVisibleIdentities(
    companyId: string,
    candidates: { external1cRefs: string[]; portalOrderIds: string[] } = { external1cRefs: [], portalOrderIds: [] },
  ) {
    if (candidates.external1cRefs.length === 0 && candidates.portalOrderIds.length === 0) return [];
    const { data, error } = await (await createClient()).rpc("get_partner_order_history_identity_matches", {
      p_company_id: companyId,
      p_external_refs: candidates.external1cRefs,
      p_portal_order_ids: candidates.portalOrderIds,
    });
    if (error) throw new OrderHistoryRepositoryError();
    return ((data ?? []) as Row[]).map((row) => ({
      external1cOrderRef: text(row.external_1c_order_ref),
      portalOrderId: nullableText(row.portal_order_id),
    }));
  }

  async findVisibleById(orderId: string): Promise<PartnerOrderHistory | null> {
    const { data, error } = await (await createClient()).from("partner_order_history").select(HISTORY_COLUMNS)
      .or(`id.eq.${orderId},portal_order_id.eq.${orderId}`).eq("partner_visible", true).maybeSingle();
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

  async getBootstrapState(companyId: string) {
    const { data, error } = await (await createClient()).rpc("get_partner_order_history_bootstrap_status", { p_company_id: companyId });
    if (error || !isRecord(data) || typeof data.status !== "string") throw new OrderHistoryRepositoryError();
    return {
      status: data.status as import("../../types").OrderHistoryBootstrapState["status"],
      requestedAt: nullableText(data.requestedAt),
      completedAt: nullableText(data.completedAt),
      lastErrorCode: nullableText(data.lastErrorCode),
    };
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

  async listKnownHeaders(companyId: string, orderRefs: string[]) {
    if (!orderRefs.length) return [];
    const { data, error } = await createAdminClient().from("partner_order_history")
      .select("external_1c_order_ref,one_c_source_version,partner_visible,hidden_reason,one_c_deletion_mark,currency_code")
      .eq("company_id", companyId)
      .in("external_1c_order_ref", orderRefs);
    if (error) throw new OrderHistoryRepositoryError();
    return ((data ?? []) as Row[]).map((row) => ({
      external1cOrderRef: text(row.external_1c_order_ref),
      oneCSourceVersion: nullableText(row.one_c_source_version),
      partnerVisible: row.partner_visible === true,
      hiddenReason: nullableText(row.hidden_reason),
      oneCDeletionMark: row.one_c_deletion_mark === true,
      currencyCode: nullableText(row.currency_code),
    }));
  }

  async listExistenceVerificationCandidates(input: { companyId: string; limit: number }) {
    const { data, error } = await createAdminClient().rpc("get_partner_order_history_existence_candidates", {
      p_company_id: input.companyId,
      p_limit: input.limit,
    });
    if (error) throw new OrderHistoryRepositoryError();
    return ((data ?? []) as Row[]).map(mapHistory);
  }

  async applyExistenceResults(input: Parameters<NonNullable<PartnerOrderHistoryRepository["applyExistenceResults"]>>[0]) {
    const { data, error } = await createAdminClient().rpc("apply_partner_order_history_existence_batch", {
      p_company_id: input.companyId,
      p_sync_id: input.syncId,
      p_verified_at: input.verifiedAt,
      p_results: input.results.map((result) => ({
        external_1c_order_ref: result.external1cOrderRef,
        status: result.status,
      })),
    });
    if (error || !isRecord(data)) throw new OrderHistoryRepositoryError();
    return { updated: numberValue(data.updated), hidden: numberValue(data.hidden), restored: numberValue(data.restored) };
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
    const rpcName = "upsert_partner_order_history_delta_batch";
    const { data, error } = await createAdminClient().rpc("upsert_partner_order_history_delta_batch", {
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
    const { data, error } = await createAdminClient().rpc("complete_partner_order_history_sync", {
      p_company_id: input.companyId,
      p_sync_id: input.syncId,
      p_mode: input.mode,
      p_incremental_date_watermark: input.incrementalDateWatermark,
      p_metrics: {
        overlap_start: input.metrics.overlapStart,
        headers_received: input.metrics.headersReceived,
        new_orders: input.metrics.newOrders,
        changed_orders: input.metrics.changedOrders,
        unchanged_orders: input.metrics.unchangedOrders,
        line_requests: input.metrics.lineRequests,
        existence_refs_checked: input.metrics.existenceRefsChecked,
        exists_count: input.metrics.existsCount,
        deleted_count: input.metrics.deletedCount,
        absent_count: input.metrics.absentCount,
        unknown_count: input.metrics.unknownCount,
        one_c_request_count: input.metrics.oneCRequestCount,
        one_c_duration_ms: Math.round(input.metrics.oneCDurationMs),
        db_writes: input.metrics.dbWrites,
        total_duration_ms: Math.round(input.metrics.totalDurationMs),
        hidden: input.hidden,
      },
    });
    if (error || data !== true) throw new OrderHistoryRepositoryError();
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
    await createAdminClient().from("partner_order_history_sync_runs").update({
      status: "failed", safe_error: input.safeError, finished_at: now,
    }).eq("id", input.syncId);
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
    lastExistenceVerifiedAt: nullableText(row.last_existence_verified_at),
    lastExistenceResult: row.last_existence_result as PartnerOrderHistory["lastExistenceResult"],
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
    incrementalDateWatermark: nullableText(row.incremental_date_watermark),
    integrityState: (nullableText(row.integrity_state) ?? "healthy") as PartnerOrderHistorySyncState["integrityState"],
    lastSuccessfulFullAuditAt: nullableText(row.last_successful_full_audit_at),
    fullAuditRequestedAt: nullableText(row.full_audit_requested_at),
    safeError: nullableText(row.safe_error), recordsReceived: numberValue(row.records_received),
    recordsInserted: numberValue(row.records_inserted), recordsUpdated: numberValue(row.records_updated),
    recordsHidden: numberValue(row.records_hidden), startedAt: nullableText(row.started_at), finishedAt: nullableText(row.finished_at),
  };
}

function mapDocument(row: Row): PartnerDocumentListItem {
  return {
    id: text(row.id),
    documentType: text(row.document_type) as PartnerDocumentListItem["documentType"],
    title: text(row.title),
    documentNumber: nullableText(row.document_number),
    issueDate: nullableText(row.issue_date),
    validFrom: nullableText(row.valid_from),
    validUntil: nullableText(row.valid_until),
    status: text(row.status) as PartnerDocumentListItem["status"],
    version: text(row.version),
    languageCode: text(row.language_code) as PartnerDocumentListItem["languageCode"],
    fileName: nullableText(row.file_name),
    mimeType: nullableText(row.mime_type),
    fileSize: nullableNumber(row.file_size),
    isCurrent: row.is_current === true,
    sourceScope: text(row.source_scope) as PartnerDocumentListItem["sourceScope"],
    products: records(row.related_products).map((product) => ({
      id: text(product.id),
      sku: text(product.sku),
      name: text(product.name),
      slug: text(product.slug),
    })),
    orders: records(row.related_orders).map((order) => ({
      id: text(order.id),
      number: text(order.number),
    })),
  };
}

function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown): string | null { return typeof value === "string" ? value : null; }
function numberValue(value: unknown): number { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function nullableNumber(value: unknown): number | null { return value === null || value === undefined ? null : numberValue(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function records(value: unknown): Row[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
