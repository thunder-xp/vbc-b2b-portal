import "server-only";
import { createClient } from "@/src/lib/supabase/server";
import type { ServiceAdminAttentionItem, ServiceCaseCreateInput, ServiceCaseDetail, ServiceCasePage, ServiceDashboardItem, ServiceDiagnostics, ServiceSelectionData, ServiceStatus } from "./types";
import { ServiceCenterRepositoryError, type ServiceCenterRepository } from "./repository";

export class SupabaseServiceCenterRepository implements ServiceCenterRepository {
  async listPartner(input: { companyId: string; query: string; status: string | null; page: number }) {
    return this.rpc<ServiceCasePage>("list_partner_service_cases", { p_company_id: input.companyId, p_query: input.query, p_status: input.status, p_page: input.page, p_page_size: 20 });
  }
  async listAdmin(input: { query: string; status: string | null; page: number }) {
    return this.rpc<ServiceCasePage>("list_admin_service_cases", { p_query: input.query, p_status: input.status, p_page: input.page, p_page_size: 25 });
  }
  async get(caseId: string) { return this.rpc<ServiceCaseDetail | null>("get_service_case", { p_case_id: caseId }); }
  async create(companyId: string, input: ServiceCaseCreateInput) {
    return this.rpc<{ id: string; caseNumber: string; status: ServiceStatus }>("create_service_case_v2", {
      p_company_id: companyId, p_case_type: input.caseType, p_product_id: input.productId, p_order_id: input.orderId,
      p_order_line_id: input.orderLineId, p_entered_serial: input.enteredSerial, p_fault_category: input.faultCategory,
      p_description: input.description, p_symptoms: input.symptoms, p_issue_started_on: input.issueStartedOn,
      p_powers_on: input.powersOn, p_factory_reset: input.factoryResetAttempted, p_preferred_contact: input.preferredContact,
      p_evidence_consent: input.evidenceConsent,
      p_warranty_verification_id: input.warrantyVerificationId,
    });
  }
  async addPartnerMessage(caseId: string, message: string) { return this.rpc<string>("add_service_case_partner_message", { p_case_id: caseId, p_message: message }); }
  async performPartnerAction(input: { caseId: string; expectedVersion: number; action: string; message: string }) {
    return this.rpc<{ id: string; status: ServiceStatus; version: number }>("perform_partner_service_action", { p_case_id: input.caseId, p_expected_version: input.expectedVersion, p_action: input.action, p_message: input.message });
  }
  async transition(input: { caseId: string; expectedVersion: number; status: ServiceStatus; partnerMessage: string; internalNote: string; assigneeId: string | null }) {
    return this.rpc<{ id: string; status: ServiceStatus; version: number }>("transition_service_case", { p_case_id: input.caseId, p_expected_version: input.expectedVersion, p_to_status: input.status, p_partner_message: input.partnerMessage, p_internal_note: input.internalNote, p_assignee: input.assigneeId });
  }
  async getSelections(companyId: string): Promise<ServiceSelectionData> {
    const client = await createClient();
    const [{ data: orders, error: orderError }, { data: products, error: productError }] = await Promise.all([
      client.from("partner_order_history").select("id,external_1c_order_number,one_c_document_date,partner_order_history_items(id,product_id,sku,product_name)").eq("company_id", companyId).eq("partner_visible", true).eq("one_c_deletion_mark", false).order("one_c_document_date", { ascending: false }).limit(50),
      client.from("catalog_products").select("id,sku,name").eq("is_active", true).eq("is_visible", true).order("name").limit(200),
    ]);
    if (orderError || productError) throw new ServiceCenterRepositoryError();
    return {
      orders: (orders ?? []).map((row) => ({ id: row.id, number: row.external_1c_order_number, date: row.one_c_document_date, lines: (row.partner_order_history_items ?? []).map((line) => ({ id: line.id, productId: line.product_id, sku: line.sku, name: line.product_name })) })),
      products: (products ?? []).map((row) => ({ id: row.id, sku: row.sku, name: row.name })),
    };
  }
  async getDashboard(companyId: string) { return this.rpc<ServiceDashboardItem[]>("get_partner_service_dashboard_v2", { p_company_id: companyId }); }
  async getAdminAttention(limit: number) { return this.rpc<ServiceAdminAttentionItem[]>("get_admin_service_attention", { p_limit: limit }); }
  async getDiagnostics() { return this.rpc<ServiceDiagnostics>("get_service_diagnostics", {}); }
  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await (await createClient()).rpc(name, args);
    if (error) { console.error({ event: "service_center_rpc_failed", rpc: name, code: error.code }); throw new ServiceCenterRepositoryError(); }
    return data as T;
  }
}
