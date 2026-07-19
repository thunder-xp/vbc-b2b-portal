import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import type { OrderDateChangeRequest } from "../../types";
import { OrderDateChangeRepositoryError, type InternalOrderDateChangeRecord, type OrderDateChangeRequestRepository } from "../order-date-change.repository";

const COLUMNS = "id, company_id, order_history_id, requested_by, current_date_snapshot, requested_date, comment, status, reviewed_by, reviewed_at, review_comment, synchronized_at, created_at, updated_at";
type Row = Record<string, unknown>;

export class SupabaseOrderDateChangeRequestRepository implements OrderDateChangeRequestRepository {
  async listLatestByOrderIds(orderIds: string[]) {
    const result = new Map<string, OrderDateChangeRequest>();
    if (!orderIds.length) return result;
    const { data, error } = await (await createClient()).from("partner_order_date_change_requests").select(COLUMNS)
      .in("order_history_id", orderIds).order("created_at", { ascending: false });
    if (error) throw new OrderDateChangeRepositoryError(error.code);
    for (const row of (data ?? []) as Row[]) {
      const mapped = mapRow(row);
      if (!result.has(mapped.orderHistoryId)) result.set(mapped.orderHistoryId, mapped);
    }
    return result;
  }

  async create(input: { orderHistoryId: string; requestedDate: string; comment: string | null }) {
    const { data, error } = await (await createClient()).rpc("create_partner_order_date_change_request", { target_order_history_id: input.orderHistoryId, target_requested_date: input.requestedDate, target_comment: input.comment });
    if (error || !data) throw new OrderDateChangeRepositoryError(error?.code ?? null);
    return mapRow(data as Row);
  }

  async cancel(requestId: string) {
    const { data, error } = await (await createClient()).rpc("cancel_partner_order_date_change_request", { target_request_id: requestId });
    if (error || !data) throw new OrderDateChangeRepositoryError(error?.code ?? null);
    return mapRow(data as Row);
  }

  async listPendingForReview(): Promise<InternalOrderDateChangeRecord[]> {
    const { data, error } = await (await createClient()).from("partner_order_date_change_requests")
      .select(`${COLUMNS}, partner_companies!partner_order_date_change_requests_company_id_fkey(name), partner_order_history!partner_order_date_change_order_company_fk(external_1c_order_number, one_c_posted, one_c_delivery_date)`)
      .eq("status", "pending").order("created_at", { ascending: true });
    if (error) throw new OrderDateChangeRepositoryError(error.code);
    return ((data ?? []) as unknown as Array<Row & { partner_companies: { name: string }; partner_order_history: { external_1c_order_number: string; one_c_posted: boolean; one_c_delivery_date: string } }>).map((row) => ({
      request: mapRow(row), companyName: row.partner_companies.name,
      orderLabel: row.partner_order_history.one_c_posted ? `№ ${row.partner_order_history.external_1c_order_number}` : "Заказ обрабатывается",
      authoritativeDate: row.partner_order_history.one_c_delivery_date,
    }));
  }

  async canReviewInternally() {
    const { data, error } = await (await createClient()).rpc("can_review_order_date_changes");
    if (error) throw new OrderDateChangeRepositoryError(error.code);
    return data === true;
  }

  async review(input: { requestId: string; decision: "approved" | "rejected"; comment: string | null }) {
    const { data, error } = await (await createClient()).rpc("review_partner_order_date_change_request", { target_request_id: input.requestId, target_decision: input.decision, target_comment: input.comment });
    if (error || !data) throw new OrderDateChangeRepositoryError(error?.code ?? null);
    return mapRow(data as Row);
  }
}

function mapRow(row: Row): OrderDateChangeRequest { return { id: text(row.id), companyId: text(row.company_id), orderHistoryId: text(row.order_history_id), requestedBy: text(row.requested_by), currentDateSnapshot: text(row.current_date_snapshot), requestedDate: text(row.requested_date), comment: nullable(row.comment), status: row.status as OrderDateChangeRequest["status"], reviewedBy: nullable(row.reviewed_by), reviewedAt: nullable(row.reviewed_at), reviewComment: nullable(row.review_comment), synchronizedAt: nullable(row.synchronized_at), createdAt: text(row.created_at), updatedAt: text(row.updated_at) }; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function nullable(value: unknown) { return typeof value === "string" ? value : null; }
