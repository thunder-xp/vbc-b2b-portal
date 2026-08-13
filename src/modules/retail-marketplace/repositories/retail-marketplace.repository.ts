import type { InstallationAssignmentAdminReport, InstallationAssignmentResponse, InstallationAssignmentView, InstallationDispatchResult, InstallationTariffSetDto, PartnerInstallationAssignmentDto, PublicInstallationProviderDto, RetailMarketplaceAdminReport } from "../types";

export interface RetailMarketplaceRepository {
  getCurrentTariffs(systemType: "cctv"): Promise<InstallationTariffSetDto | null>;
  listPublicProviders(systemType: "cctv", regionCode: string, locale: "ru" | "ro"): Promise<PublicInstallationProviderDto[]>;
  getAdminReport(): Promise<RetailMarketplaceAdminReport>;
  saveTariffDraft(input: { tariffSetId: string | null; effectiveFrom: string; currency: string; vatTreatment: string; lines: unknown[]; expectedRevision: number; reason: string }): Promise<string>;
  publishTariff(input: { tariffSetId: string; expectedRevision: number; reason: string }): Promise<void>;
  saveProvider(input: { providerId: string | null; providerType: "partner_company" | "internal_team"; backingId: string; profile: Record<string, unknown>; competencies: string[]; regionCodes: string[]; expectedRevision: number; reason: string }): Promise<string>;
  activatePilot(input: { retailOrderId: string; selectionMode: "customer_selected" | "automatic"; preferredProviderId: string | null; regionCode: string; schedulingContext: Record<string, unknown>; reason: string; idempotencyKey: string }): Promise<InstallationDispatchResult>;
  dispatch(requirementId: string): Promise<InstallationDispatchResult>;
  listPartnerAssignments(companyId: string, view: InstallationAssignmentView): Promise<PartnerInstallationAssignmentDto[]>;
  respondToAssignment(input: { companyId: string; attemptId: string; decision: "accept" | "decline"; reasonCode: string | null; reasonText: string | null; idempotencyKey: string }): Promise<InstallationAssignmentResponse>;
  getAssignmentAdminReport(limit?: number): Promise<InstallationAssignmentAdminReport>;
  reassign(input: { requirementId: string; providerId: string; expectedRevision: number; reason: string }): Promise<InstallationDispatchResult>;
  runAssignmentWorker(limit: number): Promise<{ runId?: string; status: "succeeded" | "locked"; claimed: number; timedOut?: number; dispatched?: number; unavailable?: number }>;
}
