export type PartnerIntegrityOutcome =
  | "consistent"
  | "company_missing"
  | "membership_missing"
  | "membership_company_mismatch"
  | "company_inactive"
  | "1c_mapping_missing"
  | "duplicate_company"
  | "duplicate_membership"
  | "approval_incomplete";

export type AdminPartnerMembership = {
  id: string;
  companyId: string;
  companyName: string;
  companyStatus: string;
  roleCode: string;
  status: string;
  version: number;
  createdAt: string;
  approvedAt: string | null;
  endedAt: string | null;
  isDefault: boolean;
  historyReason: string | null;
  relatedAuditEvent: {
    id: string;
    operationType: string;
    correlationId: string;
    occurredAt: string;
  } | null;
};

export type OnboardingIntegrityDiagnostic = {
  outcome: PartnerIntegrityOutcome;
  requestId: string;
  userProfileId: string;
  requestedCompanyName: string | null;
  requestedFiscalCode: string | null;
  normalizedFiscalCode: string;
  actualRequestCompanyId: string | null;
  expectedCounterpartyId: string | null;
  expectedExternal1cId: string | null;
  expectedCompanyId: string | null;
  expectedMembershipId: string | null;
  activeMembershipCount: number;
};

export type AdminPartnerUserIntegrity = {
  identity: {
    id: string;
    email: string;
    fullName: string | null;
    status: string;
    userType: string;
  };
  memberships: AdminPartnerMembership[];
  requests: Array<{
    id: string;
    status: string;
    companyId: string | null;
    requestedCompanyName: string | null;
    requestedFiscalCode: string | null;
    integrity: OnboardingIntegrityDiagnostic | null;
  }>;
  audit: Array<{
    id: string;
    operationType: string;
    reason: string;
    correlationId: string;
    occurredAt: string;
  }>;
};

export type PartnerIntegrityTargetCompany = {
  companyId: string;
  displayName: string;
  status: string;
  external1cId: string;
};

export type PartnerIntegrityRepairResult = {
  idempotent: boolean;
  companyId: string;
  membershipId: string;
  sourceMembershipId: string;
  policyPreset?: string;
  bootstrapJobId?: string;
  auditEventId: string;
  correlationId: string;
};
