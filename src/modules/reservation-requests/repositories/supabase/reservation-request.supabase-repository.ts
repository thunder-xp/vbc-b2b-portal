import { createClient } from "@/src/lib/supabase/server";

import type { InternalReservationRequestRecord, ReservationRequestRepository } from "../reservation-request.repository";
import { ReservationRequestRepositoryError } from "../reservation-request.repository";
import type { ReservationRequest, ReservationRequestItem } from "../../types";
import { mapReservationRequestItemRow, mapReservationRequestRow, type ReservationRequestItemRow, type ReservationRequestRow } from "./mappers";

const REQUEST_COLUMNS = "id, company_id, specification_id, specification_revision_id, created_by, status, requested_delivery_date, partner_comment, manager_comment, submitted_at, reviewed_at, reviewed_by, created_at, updated_at";
const ITEM_COLUMNS = "id, reservation_request_id, product_id, product_name_snapshot, sku_snapshot, slug_snapshot, specification_quantity, requested_quantity, approved_quantity, partner_unit_price_amount, partner_currency_code, retail_unit_price_amount, retail_currency_code, created_at, updated_at";

export class SupabaseReservationRequestRepository implements ReservationRequestRepository {
  async listByCompanyId(companyId: string): Promise<ReservationRequest[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("reservation_requests").select(REQUEST_COLUMNS).eq("company_id", companyId).order("created_at", { ascending: false });
    if (error) throw new ReservationRequestRepositoryError();
    return (data as ReservationRequestRow[]).map(mapReservationRequestRow);
  }

  async listForInternalReview(): Promise<InternalReservationRequestRecord[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("reservation_requests").select(`${REQUEST_COLUMNS}, partner_companies!reservation_requests_company_id_fkey(name), project_specifications!reservation_requests_specification_revision_id_fkey(project_name, customer_site_name)`).neq("status", "draft").order("submitted_at", { ascending: false });
    if (error) throw new ReservationRequestRepositoryError();
    return (data as unknown as Array<ReservationRequestRow & {
      partner_companies: { name: string };
      project_specifications: { project_name: string; customer_site_name: string };
    }>).map((row) => ({
      request: mapReservationRequestRow(row),
      companyName: row.partner_companies.name,
      projectName: row.project_specifications.project_name,
      customerSiteName: row.project_specifications.customer_site_name,
    }));
  }

  async findById(requestId: string): Promise<ReservationRequest | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("reservation_requests").select(REQUEST_COLUMNS).eq("id", requestId).maybeSingle();
    if (error) throw new ReservationRequestRepositoryError();
    return data ? mapReservationRequestRow(data as ReservationRequestRow) : null;
  }

  async findActiveBySpecificationRevisionId(specificationRevisionId: string): Promise<ReservationRequest | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("reservation_requests").select(REQUEST_COLUMNS).eq("specification_revision_id", specificationRevisionId).not("status", "in", "(rejected,cancelled)").maybeSingle();
    if (error) throw new ReservationRequestRepositoryError();
    return data ? mapReservationRequestRow(data as ReservationRequestRow) : null;
  }

  async listItems(requestId: string): Promise<ReservationRequestItem[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("reservation_request_items").select(ITEM_COLUMNS).eq("reservation_request_id", requestId).order("created_at");
    if (error) throw new ReservationRequestRepositoryError();
    return (data as ReservationRequestItemRow[]).map(mapReservationRequestItemRow);
  }

  async createFromApprovedSpecification(input: { specificationId: string; requestedDeliveryDate: string; partnerComment: string | null }): Promise<ReservationRequest> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_reservation_request_from_specification", {
      target_specification_id: input.specificationId,
      target_delivery_date: input.requestedDeliveryDate,
      target_partner_comment: input.partnerComment,
    }).single();
    if (error || !data) throw new ReservationRequestRepositoryError();
    return mapReservationRequestRow(data as ReservationRequestRow);
  }

  async updateDraft(input: { requestId: string; requestedDeliveryDate: string | null; partnerComment: string | null }): Promise<ReservationRequest> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("reservation_requests").update({ requested_delivery_date: input.requestedDeliveryDate, partner_comment: input.partnerComment }).eq("id", input.requestId).eq("status", "draft").select(REQUEST_COLUMNS).single();
    if (error || !data) throw new ReservationRequestRepositoryError();
    return mapReservationRequestRow(data as ReservationRequestRow);
  }

  async updateRequestedQuantity(input: { itemId: string; requestedQuantity: number }): Promise<ReservationRequestItem> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("reservation_request_items").update({ requested_quantity: input.requestedQuantity }).eq("id", input.itemId).select(ITEM_COLUMNS).single();
    if (error || !data) throw new ReservationRequestRepositoryError();
    return mapReservationRequestItemRow(data as ReservationRequestItemRow);
  }

  async submit(requestId: string): Promise<ReservationRequest> {
    return this.requestRpc("submit_reservation_request", { target_request_id: requestId });
  }

  async canReviewInternally(): Promise<boolean> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("can_review_reservation_requests");
    if (error) throw new ReservationRequestRepositoryError();
    return data === true;
  }

  async startReview(requestId: string): Promise<ReservationRequest> {
    return this.requestRpc("start_reservation_request_review", { target_request_id: requestId });
  }

  async decide(input: Parameters<ReservationRequestRepository["decide"]>[0]): Promise<ReservationRequest> {
    return this.requestRpc("decide_reservation_request", {
      target_request_id: input.requestId,
      target_status: input.status,
      approved_quantities: input.approvedQuantities.map((item) => ({ itemId: item.itemId, approvedQuantity: item.approvedQuantity })),
      response_comment: input.comment,
    });
  }

  private async requestRpc(name: string, input: Record<string, unknown>): Promise<ReservationRequest> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(name, input).single();
    if (error || !data) throw new ReservationRequestRepositoryError();
    return mapReservationRequestRow(data as ReservationRequestRow);
  }
}
