export type InstallationServiceType = "camera_installation" | "cable_laying" | "commissioning" | "remote_configuration";
export type InstallationUnitCode = "piece" | "meter" | "service";

export type InstallationTariffSetDto = {
  tariffSetId: string;
  version: number;
  systemType: "cctv";
  currency: string;
  vatTreatment: "included" | "excluded" | "not_specified";
  effectiveFrom: string;
  lines: Array<{ serviceType: InstallationServiceType; unitCode: InstallationUnitCode; unitPrice: number }>;
};

export type InstallationPricingResult = {
  complete: boolean;
  tariffSetId: string | null;
  tariffVersion: number | null;
  currency: string | null;
  vatTreatment: InstallationTariffSetDto["vatTreatment"] | null;
  lines: Array<{ serviceType: InstallationServiceType; quantity: number; unitCode: InstallationUnitCode; unitPrice: number; amount: number }>;
  subtotal: number | null;
  missing: InstallationServiceType[];
};

export type PublicInstallationProviderDto = {
  providerId: string;
  displayName: string;
  description: string | null;
  logoPath: string | null;
  coverage: string;
  systemType: "cctv";
  availability: "available" | "limited";
};

export type RetailMarketplaceAdminReport = {
  tariffSets: Array<{ id: string; version: number; systemType: "cctv"; status: "draft" | "published" | "superseded" | "archived"; currency: string; vatTreatment: InstallationTariffSetDto["vatTreatment"]; effectiveFrom: string; effectiveTo: string | null; revision: number; lines: InstallationTariffSetDto["lines"] }>;
  providers: Array<{ id: string; providerType: "partner_company" | "internal_team"; backingName: string; operationalStatus: "active" | "inactive" | "suspended"; approvalStatus: "pending" | "approved" | "rejected"; marketplaceEnabled: boolean; revision: number; publicNameRu: string; publicNameRo: string; publicProfileStatus: "draft" | "published"; availability: "available" | "limited" | "unavailable"; maxConcurrentJobs: number | null; acceptanceSlaMinutes: number; competencies: string[]; regions: string[] }>;
  regions: Array<{ id: string; code: string; nameRu: string; nameRo: string; regionType: string }>;
  partnerCompanies: Array<{ id: string; name: string }>;
  internalTeams: Array<{ id: string; name: string }>;
};

export type InstallationAssignmentView = "offers" | "active" | "completed";
export type InstallationAssignmentStatus = "offered" | "accepted" | "declined" | "timed_out" | "withdrawn";
export type InstallationExecutionState = "scheduling" | "scheduled" | "in_progress" | "completed_by_provider" | "customer_confirmation_pending" | "customer_confirmed" | "issue_reported" | "disputed" | "resolved" | "cancelled";
export type InstallationExecutionCommand = "schedule" | "start" | "complete" | "open_dispute" | "resolve_dispute" | "cancel";
export type InstallationExecutionResult = { executionId: string; state: InstallationExecutionState; revision: number; repeated: boolean; scheduledStartAt: string | null; scheduledEndAt: string | null };

export type PartnerInstallationAssignmentDto = {
  attemptId: string;
  requirementId: string;
  orderNumber: string;
  ordinal: number;
  status: InstallationAssignmentStatus;
  source: "customer_selected" | "automatic" | "manual_internal" | "reassignment" | "fallback_internal";
  offeredAt: string;
  deadlineAt: string;
  locality: string;
  systemType: "cctv";
  scope: Array<{ serviceType: InstallationServiceType; quantity: number; unitCode: InstallationUnitCode }>;
  customerInstallationCharge: null;
  providerPayable: null;
  customer: { name: string; phone: string; email: string | null } | null;
  exactAddress: { locality: string; street: string; building: string; unit?: string | null; postalCode?: string | null; instructions?: string | null } | null;
  execution: { id: string; state: InstallationExecutionState; revision: number; scheduledStartAt: string | null; scheduledEndAt: string | null; providerCompletedAt: string | null; customerConfirmedAt: string | null; issueCategory: string | null; completedAt: string | null } | null;
};

export type InstallationDispatchResult = {
  requirementId: string;
  status: "assignment_pending" | "offered" | "assigned" | "assignment_unavailable";
  attemptId?: string;
  providerId?: string;
  source?: string;
  ordinal?: number;
  repeated: boolean;
};

export type InstallationAssignmentResponse = {
  attemptId: string;
  requirementId?: string;
  status: "accepted" | "declined";
  executionId?: string;
  repeated: boolean;
};

export type InstallationAssignmentAdminReport = {
  requirements: Array<{
    id: string;
    orderNumber: string;
    status: "assignment_pending" | "offered" | "reassignment_pending" | "assigned" | "assignment_unavailable";
    selectionMode: "customer_selected" | "automatic";
    locality: string;
    customerInstallationCharge: number;
    currency: string;
    revision: number;
    currentAttemptId: string | null;
    acceptedProviderId: string | null;
    activatedAt: string;
    execution: { id: string; state: InstallationExecutionState; revision: number; providerId: string; scheduledStartAt: string | null; scheduledEndAt: string | null; updatedAt: string; issueCategory: string | null } | null;
    attempts: Array<{ id: string; ordinal: number; providerId: string; source: string; status: InstallationAssignmentStatus; offeredAt: string; deadlineAt: string; declineReasonCode: string | null }>;
  }>;
};
