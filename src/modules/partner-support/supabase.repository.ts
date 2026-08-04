import "server-only";
import { createClient } from "@/src/lib/supabase/server";
import type { PartnerSupportRepository } from "./repository";
import { PartnerSupportRepositoryError } from "./repository";
import type { SupportDashboardItem, SupportDiagnostics, SupportTicketDetail, SupportTicketPage } from "./types";

export class SupabasePartnerSupportRepository implements PartnerSupportRepository {
  listPartner(input: Parameters<PartnerSupportRepository["listPartner"]>[0]) { return this.rpc<SupportTicketPage>("list_partner_support_tickets", { p_company_id: input.companyId, p_query: input.query, p_filter: input.filter, p_page: input.page, p_page_size: 20 }); }
  listAdmin(input: Parameters<PartnerSupportRepository["listAdmin"]>[0]) { return this.rpc<SupportTicketPage>("list_admin_partner_support_tickets", { p_query: input.query, p_status: input.status, p_priority: input.priority, p_mode: input.mode, p_company: input.company, p_assignee: input.assigneeId, p_category: input.category, p_created_from: input.createdFrom, p_created_to: input.createdTo, p_page: input.page, p_page_size: 25 }); }
  listAssignees() { return this.rpc<Awaited<ReturnType<PartnerSupportRepository["listAssignees"]>>>("list_partner_support_assignees", {}); }
  get(ticketId: string) { return this.rpc<SupportTicketDetail | null>("get_partner_support_ticket", { p_ticket_id: ticketId }); }
  create(input: Parameters<PartnerSupportRepository["create"]>[0]) { return this.rpc<Awaited<ReturnType<PartnerSupportRepository["create"]>>>("create_partner_support_ticket", { p_company_id: input.companyId, p_description: input.description, p_priority: input.priority, p_idempotency_key: input.idempotencyKey, p_locale: input.locale }); }
  reply(input: Parameters<PartnerSupportRepository["reply"]>[0]) { return this.rpc<Awaited<ReturnType<PartnerSupportRepository["reply"]>>>("add_partner_support_message", { p_ticket_id: input.ticketId, p_expected_version: input.expectedVersion, p_message: input.message }); }
  partnerTransition(input: Parameters<PartnerSupportRepository["partnerTransition"]>[0]) { return this.rpc<Awaited<ReturnType<PartnerSupportRepository["partnerTransition"]>>>("partner_transition_support_ticket", { p_ticket_id: input.ticketId, p_expected_version: input.expectedVersion, p_action: input.action }); }
  transition(input: Parameters<PartnerSupportRepository["transition"]>[0]) { return this.rpc<Awaited<ReturnType<PartnerSupportRepository["transition"]>>>("transition_partner_support_ticket", { p_ticket_id: input.ticketId, p_expected_version: input.expectedVersion, p_to_status: input.status, p_partner_reply: input.partnerReply, p_internal_note: input.internalNote, p_assignee: input.assigneeId, p_category: input.category, p_effective_priority: input.effectivePriority, p_priority_reason: input.priorityReason }); }
  dashboard(companyId: string) { return this.rpc<SupportDashboardItem[]>("get_partner_support_dashboard", { p_company_id: companyId }); }
  diagnostics() { return this.rpc<SupportDiagnostics>("get_partner_support_diagnostics", {}); }
  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const { data, error } = await (await createClient()).rpc(name, args); if (error) { console.error({ event: "partner_support_rpc_failed", rpc: name, code: error.code }); throw new PartnerSupportRepositoryError(); } return data as T; }
}
