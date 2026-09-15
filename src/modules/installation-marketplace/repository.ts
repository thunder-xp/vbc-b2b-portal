import type { InstallationMarketplaceAdminReport, InstallationProjectDetail, InstallationProjectSummary, InstallationRankingAdminDiagnostics, InstallationRankingDecision, InstallationRankingEvidence, PartnerInstallationProject } from "./types";

export interface InstallationMarketplaceRepository {
  listRegions(locale: "ru" | "ro"): Promise<Array<{ code: string; name: string }>>;
  isCustomerOrderEligible(orderId: string): Promise<boolean>;
  createProject(input: { sourceType: string; sourceOrderId: string | null; sourcePublicProductId: string | null; objectType: string; locality: string; regionCode: string | null; needType: string; description: string | null; contactConsent: boolean; creationKey: string }): Promise<{ projectId: string; repeated: boolean }>;
  listCustomerProjects(limit: number, offset: number, locale: "ru" | "ro"): Promise<InstallationProjectSummary[]>;
  getCustomerProject(projectId: string, locale: "ru" | "ro"): Promise<InstallationProjectDetail | null>;
  getRankingEvidence(projectId: string, customerAccountId: string, locale: "ru" | "ro"): Promise<InstallationRankingEvidence>;
  recordRankingDecision(decision: InstallationRankingDecision, customerAccountId: string, shortlistLimit: number): Promise<{ decisionId: string; countedImpressions: number }>;
  selectPartner(input: { projectId: string; providerId: string; expectedRevision: number; idempotencyKey: string }): Promise<{ assignmentId: string; status: string; repeated: boolean }>;
  transitionCustomer(input: { projectId: string; command: "CONFIRM" | "DISPUTE" | "CANCEL"; expectedRevision: number; idempotencyKey: string }): Promise<{ projectId: string; status: string; repeated: boolean }>;
  submitReview(input: { projectId: string; overall: number; workmanship: number; communication: number; agreement: number; comment: string | null; idempotencyKey: string }): Promise<{ reviewId: string; repeated: boolean }>;
  listPartnerProjects(input: { companyId: string; view: "new" | "active" | "completed"; limit: number; offset: number; locale: "ru" | "ro" }): Promise<PartnerInstallationProject[]>;
  respondPartner(input: { companyId: string; assignmentId: string; decision: "ACCEPT" | "DECLINE"; reason: string | null; reasonNote: string | null; expectedRevision: number; idempotencyKey: string }): Promise<{ assignmentId: string; status: string; repeated: boolean }>;
  transitionPartner(input: { companyId: string; assignmentId: string; command: "CONTACTED" | "SCHEDULED" | "INSTALLED"; plannedFor: string | null; expectedRevision: number; idempotencyKey: string }): Promise<{ projectId: string; status: string; repeated: boolean }>;
  listAdmin(limit: number, status: string | null): Promise<InstallationMarketplaceAdminReport>;
  getAdminRankingDiagnostics(projectId: string | null): Promise<InstallationRankingAdminDiagnostics>;
  moderateReview(input: { reviewId: string; status: "PUBLISHED" | "PENDING_REVIEW" | "HIDDEN"; expectedRevision: number; reason: string; correlationId: string }): Promise<{ reviewId: string; status: string; revision: number }>;
}
