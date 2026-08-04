import type { SupportAssignee, SupportDashboardItem, SupportDiagnostics, SupportPriority, SupportStatus, SupportTicketDetail, SupportTicketPage } from "./types";

export interface PartnerSupportRepository {
  listPartner(input: { companyId: string; query: string; filter: string; page: number }): Promise<SupportTicketPage>;
  listAdmin(input: { query: string; status: string | null; priority: string | null; mode: string | null; company: string; assigneeId: string | null; category: string | null; createdFrom: string | null; createdTo: string | null; page: number }): Promise<SupportTicketPage>;
  listAssignees(): Promise<SupportAssignee[]>;
  get(ticketId: string): Promise<SupportTicketDetail | null>;
  create(input: { companyId: string; description: string; priority: SupportPriority; idempotencyKey: string; locale: string }): Promise<{ id: string; ticketNumber: string; status: SupportStatus; version: number }>;
  reply(input: { ticketId: string; expectedVersion: number; message: string }): Promise<{ id: string; status: SupportStatus; version: number }>;
  partnerTransition(input: { ticketId: string; expectedVersion: number; action: "confirm_solution" | "reopen" | "cancel" }): Promise<{ id: string; status: SupportStatus; version: number }>;
  transition(input: { ticketId: string; expectedVersion: number; status: SupportStatus; partnerReply: string; internalNote: string; assigneeId: string | null; category: string | null; effectivePriority: SupportPriority | null; priorityReason: string }): Promise<{ id: string; status: SupportStatus; version: number }>;
  dashboard(companyId: string): Promise<SupportDashboardItem[]>;
  diagnostics(): Promise<SupportDiagnostics>;
}
export class PartnerSupportRepositoryError extends Error { constructor() { super("Support data is temporarily unavailable."); this.name = "PartnerSupportRepositoryError"; } }
