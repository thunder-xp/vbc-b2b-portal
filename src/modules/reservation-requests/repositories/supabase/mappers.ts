import { ReservationRequestStatus, type ReservationRequest, type ReservationRequestItem } from "../../types";

export type ReservationRequestRow = {
  id: string; company_id: string; specification_id: string; specification_revision_id: string;
  created_by: string; status: ReservationRequestStatus; requested_delivery_date: string | null;
  partner_comment: string | null; manager_comment: string | null; submitted_at: string | null;
  reviewed_at: string | null; reviewed_by: string | null; created_at: string; updated_at: string;
};

export type ReservationRequestItemRow = {
  id: string; reservation_request_id: string; product_id: string; product_name_snapshot: string;
  sku_snapshot: string; slug_snapshot: string; specification_quantity: number; requested_quantity: number;
  approved_quantity: number | null; partner_unit_price_amount: number | null; partner_currency_code: string | null;
  retail_unit_price_amount: number | null; retail_currency_code: string | null; created_at: string; updated_at: string;
};

export function mapReservationRequestRow(row: ReservationRequestRow): ReservationRequest {
  return {
    id: row.id, companyId: row.company_id, specificationId: row.specification_id,
    specificationRevisionId: row.specification_revision_id, createdBy: row.created_by, status: row.status,
    requestedDeliveryDate: row.requested_delivery_date, partnerComment: row.partner_comment,
    managerComment: row.manager_comment, submittedAt: row.submitted_at, reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function mapReservationRequestItemRow(row: ReservationRequestItemRow): ReservationRequestItem {
  return {
    id: row.id, reservationRequestId: row.reservation_request_id, productId: row.product_id,
    productNameSnapshot: row.product_name_snapshot, skuSnapshot: row.sku_snapshot, slugSnapshot: row.slug_snapshot,
    specificationQuantity: row.specification_quantity, requestedQuantity: row.requested_quantity,
    approvedQuantity: row.approved_quantity, partnerUnitPriceAmount: row.partner_unit_price_amount,
    partnerCurrencyCode: row.partner_currency_code, retailUnitPriceAmount: row.retail_unit_price_amount,
    retailCurrencyCode: row.retail_currency_code, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
