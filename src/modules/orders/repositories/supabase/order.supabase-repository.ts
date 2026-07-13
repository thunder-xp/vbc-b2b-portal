import { createClient } from "@/src/lib/supabase/server";

import { CartStatus, PartnerOrderStatus, type Cart, type CartItem, type PartnerOrder, type PartnerOrderItem } from "../../types";
import { OrderRepositoryError, type CartRepository, type PartnerOrderRepository } from "../order.repository";

const CART_COLUMNS = "id, company_id, created_by, status, created_at, updated_at";
const CART_ITEM_COLUMNS = "id, cart_id, product_id, quantity, created_at, updated_at";
const ORDER_COLUMNS = "id, company_id, submitted_by, cart_id, submission_key, submission_attempt_id, status, requested_delivery_date, external_1c_ref, external_1c_number, external_1c_date, payload_snapshot, safe_error_code, safe_error_message, submitted_at, created_at, updated_at";
const ORDER_ITEM_COLUMNS = "id, order_id, product_id, external_product_ref, product_name, sku, quantity, partner_unit_price, currency_code, line_total, available_stock, nearest_arrival_date, nearest_arrival_quantity, snapshot_at";

type Row = Record<string, unknown>;

export class SupabaseCartRepository implements CartRepository {
  async findActive(companyId: string, userId: string): Promise<Cart | null> {
    const { data, error } = await (await createClient()).from("carts").select(CART_COLUMNS)
      .eq("company_id", companyId).eq("created_by", userId).in("status", ["active", "submitting"]).maybeSingle();
    if (error) throw new OrderRepositoryError();
    return data ? mapCart(data as Row) : null;
  }

  async listItems(cartId: string): Promise<CartItem[]> {
    const { data, error } = await (await createClient()).from("cart_items").select(CART_ITEM_COLUMNS)
      .eq("cart_id", cartId).order("created_at");
    if (error) throw new OrderRepositoryError();
    return ((data ?? []) as Row[]).map(mapCartItem);
  }

  async addItem(companyId: string, productId: string, quantity: number): Promise<CartItem> {
    const { data, error } = await (await createClient()).rpc("add_partner_cart_item", {
      target_company_id: companyId, target_product_id: productId, added_quantity: quantity,
    });
    if (error || !data) throw new OrderRepositoryError(error?.code ?? null, error?.message ?? null);
    return mapCartItem(data as Row);
  }

  async updateItemQuantity(itemId: string, quantity: number): Promise<CartItem> {
    const { data, error } = await (await createClient()).rpc("set_partner_cart_item_quantity", {
      target_item_id: itemId, target_quantity: quantity,
    });
    if (error || !data) throw new OrderRepositoryError(error?.code ?? null, error?.message ?? null);
    return mapCartItem(data as Row);
  }

  async removeItem(itemId: string): Promise<void> {
    const { error } = await (await createClient()).rpc("remove_partner_cart_item", { target_item_id: itemId });
    if (error) throw new OrderRepositoryError();
  }

}

export class SupabasePartnerOrderRepository implements PartnerOrderRepository {
  async findBySubmissionKey(submissionKey: string): Promise<PartnerOrder | null> {
    const { data, error } = await (await createClient()).from("partner_orders").select(ORDER_COLUMNS)
      .eq("submission_key", submissionKey).maybeSingle();
    if (error) {
      console.error({
        event: "partner_order_repository_failed",
        operation: "find_order_by_submission_key",
        table: "partner_orders",
        submissionKey,
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw new OrderRepositoryError(error.code, error.message);
    }
    return data ? mapOrder(data as Row) : null;
  }

  async listByCompanyId(companyId: string): Promise<PartnerOrder[]> {
    const { data, error } = await (await createClient()).from("partner_orders").select(ORDER_COLUMNS)
      .eq("company_id", companyId).order("created_at", { ascending: false });
    if (error) throw new OrderRepositoryError();
    return ((data ?? []) as Row[]).map(mapOrder);
  }

  async findById(orderId: string): Promise<PartnerOrder | null> {
    const { data, error } = await (await createClient()).from("partner_orders").select(ORDER_COLUMNS)
      .eq("id", orderId).maybeSingle();
    if (error) throw new OrderRepositoryError();
    return data ? mapOrder(data as Row) : null;
  }

  async listItems(orderId: string): Promise<PartnerOrderItem[]> {
    const { data, error } = await (await createClient()).from("partner_order_items").select(ORDER_ITEM_COLUMNS)
      .eq("order_id", orderId).order("snapshot_at");
    if (error) throw new OrderRepositoryError();
    return ((data ?? []) as Row[]).map(mapOrderItem);
  }

  async beginSubmission(input: Parameters<PartnerOrderRepository["beginSubmission"]>[0]): Promise<PartnerOrder> {
    const { data, error } = await (await createClient()).rpc("begin_partner_order_submission", {
      target_cart_id: input.cartId,
      target_submission_key: input.submissionKey,
      target_attempt_id: input.submissionAttemptId,
      target_delivery_date: input.requestedDeliveryDate,
      target_payload: input.payloadSnapshot,
      target_items: input.items.map((item) => ({
        product_id: item.productId,
        external_product_ref: item.externalProductRef,
        external_characteristic_ref: item.externalCharacteristicRef,
        external_unit_ref: item.externalUnitRef,
        external_vat_rate_ref: item.externalVatRateRef,
        product_name: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        partner_unit_price: item.partnerUnitPrice,
        currency_code: item.currencyCode,
        line_total: item.lineTotal,
        available_stock: item.availableStock,
        nearest_arrival_date: item.nearestArrivalDate,
        nearest_arrival_quantity: item.nearestArrivalQuantity,
      })),
    });
    if (error || !data) {
      console.error({
        event: "partner_order_repository_failed",
        operation: "begin_partner_order_submission",
        table: "partner_orders",
        cartId: input.cartId,
        submissionKey: input.submissionKey,
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? "RPC returned no order.",
      });
      throw new OrderRepositoryError(error?.code ?? null, error?.message ?? "RPC returned no order.");
    }
    return mapOrder(data as Row);
  }

  async completeSubmission(input: Parameters<PartnerOrderRepository["completeSubmission"]>[0]): Promise<PartnerOrder> {
    const { data, error } = await (await createClient()).rpc("complete_partner_order_submission", {
      target_order_id: input.orderId,
      one_c_ref: input.external1cRef,
      one_c_number: input.external1cNumber,
      one_c_date: input.external1cDate,
    });
    if (error || !data) throw new OrderRepositoryError();
    return mapOrder(data as Row);
  }

  async failSubmission(input: Parameters<PartnerOrderRepository["failSubmission"]>[0]): Promise<PartnerOrder> {
    const { data, error } = await (await createClient()).rpc("fail_partner_order_submission", {
      target_order_id: input.orderId,
      target_status: input.status,
      error_code: input.errorCode,
      error_message: input.errorMessage,
      error_details: input.errorDetails ?? null,
      error_hint: input.errorHint ?? null,
    });
    if (error || !data) throw new OrderRepositoryError();
    return mapOrder(data as Row);
  }
}

function mapCart(row: Row): Cart {
  return { id: text(row.id), companyId: text(row.company_id), createdBy: text(row.created_by), status: row.status as CartStatus, createdAt: text(row.created_at), updatedAt: text(row.updated_at) };
}
function mapCartItem(row: Row): CartItem {
  return { id: text(row.id), cartId: text(row.cart_id), productId: text(row.product_id), quantity: Number(row.quantity), createdAt: text(row.created_at), updatedAt: text(row.updated_at) };
}
function mapOrder(row: Row): PartnerOrder {
  return {
    id: text(row.id), companyId: text(row.company_id), submittedBy: text(row.submitted_by), cartId: nullableText(row.cart_id),
    submissionKey: text(row.submission_key), submissionAttemptId: text(row.submission_attempt_id), status: row.status as PartnerOrderStatus,
    requestedDeliveryDate: text(row.requested_delivery_date), external1cRef: nullableText(row.external_1c_ref),
    external1cNumber: nullableText(row.external_1c_number), external1cDate: nullableText(row.external_1c_date),
    payloadSnapshot: isRecord(row.payload_snapshot) ? row.payload_snapshot : {}, safeErrorCode: nullableText(row.safe_error_code),
    safeErrorMessage: nullableText(row.safe_error_message), submittedAt: nullableText(row.submitted_at), createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  };
}
function mapOrderItem(row: Row): PartnerOrderItem {
  return {
    id: text(row.id), orderId: text(row.order_id), productId: text(row.product_id), externalProductRef: text(row.external_product_ref),
    productName: text(row.product_name), sku: text(row.sku), quantity: Number(row.quantity), partnerUnitPrice: Number(row.partner_unit_price),
    currencyCode: text(row.currency_code), lineTotal: Number(row.line_total), availableStock: nullableNumber(row.available_stock),
    nearestArrivalDate: nullableText(row.nearest_arrival_date), nearestArrivalQuantity: nullableNumber(row.nearest_arrival_quantity), snapshotAt: text(row.snapshot_at),
  };
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown): string | null { return typeof value === "string" ? value : null; }
function nullableNumber(value: unknown): number | null { return value === null || value === undefined ? null : Number(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
