import type { ServiceAdminAttentionItem, ServiceCaseCreateInput, ServiceCaseDetail, ServiceCasePage, ServiceDashboardItem, ServiceDiagnostics, ServiceSelectionData, ServiceStatus } from "./types";

export interface ServiceCenterRepository {
  listPartner(input: { companyId: string; query: string; status: string | null; page: number }): Promise<ServiceCasePage>;
  listAdmin(input: { query: string; status: string | null; page: number }): Promise<ServiceCasePage>;
  get(caseId: string): Promise<ServiceCaseDetail | null>;
  create(companyId: string, input: ServiceCaseCreateInput): Promise<{ id: string; caseNumber: string; status: ServiceStatus }>;
  addPartnerMessage(caseId: string, message: string): Promise<string>;
  performPartnerAction(input: { caseId: string; expectedVersion: number; action: string; message: string }): Promise<{ id: string; status: ServiceStatus; version: number }>;
  transition(input: { caseId: string; expectedVersion: number; status: ServiceStatus; partnerMessage: string; internalNote: string; assigneeId: string | null }): Promise<{ id: string; status: ServiceStatus; version: number }>;
  getSelections(companyId: string): Promise<ServiceSelectionData>;
  getDashboard(companyId: string): Promise<ServiceDashboardItem[]>;
  getAdminAttention(limit: number): Promise<ServiceAdminAttentionItem[]>;
  getDiagnostics(): Promise<ServiceDiagnostics>;
}

export class ServiceCenterRepositoryError extends Error { constructor(readonly code: string | null = null) { super("Service data is temporarily unavailable."); this.name = "ServiceCenterRepositoryError"; } }
