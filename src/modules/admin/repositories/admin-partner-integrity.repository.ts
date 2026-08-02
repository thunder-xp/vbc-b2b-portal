import type {
  AdminPartnerUserIntegrity,
  OnboardingIntegrityDiagnostic,
  PartnerIntegrityRepairResult,
  PartnerIntegrityTargetCompany,
} from "../types";

export type PartnerIntegrityRepairInput = {
  requestId: string;
  counterpartyId: string;
  sourceMembershipId: string;
  expectedSourceVersion: number;
  mode: "move" | "add";
  roleCode: string;
  reason: string;
  operationKey: string;
  correlationId: string;
};

export type PartnerMembershipMutationInput = Omit<PartnerIntegrityRepairInput, "requestId" | "counterpartyId"> & {
  userId: string;
  targetCompanyId: string;
};

export interface AdminPartnerIntegrityRepository {
  getUser(profileId: string): Promise<AdminPartnerUserIntegrity | null>;
  diagnose(requestId: string): Promise<OnboardingIntegrityDiagnostic | null>;
  listTargetCompanies(search: string): Promise<PartnerIntegrityTargetCompany[]>;
  repairApprovedRequest(input: PartnerIntegrityRepairInput): Promise<PartnerIntegrityRepairResult>;
  mutateMembership(input: PartnerMembershipMutationInput): Promise<PartnerIntegrityRepairResult>;
}
