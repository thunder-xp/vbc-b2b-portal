export const ONBOARDING_STATUSES = [
  "received",
  "under_review",
  "clarification_requested",
  "awaiting_1c_company",
  "link_confirmation_required",
  "ready_for_approval",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const ONBOARDING_COMPANY_VERIFICATION_OUTCOMES = [
  "exact_match_found",
  "no_match",
  "multiple_matches",
  "directory_stale",
  "directory_sync_failed",
  "counterparty_inactive",
  "commercial_mapping_incomplete",
] as const;

export const ONBOARDING_DIRECTORY_MATCH_OUTCOMES = [
  "EXACT_FISCAL_MATCH",
  "NAME_SUGGESTION_ONLY",
  "FISCAL_CODE_MISSING_IN_DIRECTORY",
  "FISCAL_CODE_MALFORMED",
  "MULTIPLE_EXACT_FISCAL_MATCHES",
  "COUNTERPARTY_INACTIVE",
  "COUNTERPARTY_NOT_PUBLISHED",
  "DIRECTORY_SYNC_INCOMPLETE",
  "NO_MATCH",
] as const;

export type OnboardingDirectoryMatchOutcome =
  (typeof ONBOARDING_DIRECTORY_MATCH_OUTCOMES)[number];

export type OnboardingCompanyVerificationOutcome =
  (typeof ONBOARDING_COMPANY_VERIFICATION_OUTCOMES)[number];

export const CLARIFICATION_REASON_CODES = [
  "company_data_incomplete",
  "fiscal_code_needs_confirmation",
  "contact_details_incomplete",
  "business_activity_unclear",
  "existing_company_conflict",
  "1c_company_not_found",
  "additional_documents_required",
  "other",
] as const;

export const REJECTION_REASON_CODES = [
  "duplicate_application",
  "company_not_verified",
  "invalid_information",
  "unsupported_business_type",
  "existing_membership",
  "company_access_conflict",
  "not_eligible",
  "cancelled_by_applicant",
  "other",
] as const;

export const PARTNER_CORRECTION_FIELDS = [
  "company_name",
  "fiscal_code",
  "contact_name",
  "phone",
  "email",
  "locality",
  "business_type",
  "business_activity",
  "estimated_purchasing_volume",
  "comment",
] as const;

export type ClarificationReasonCode = (typeof CLARIFICATION_REASON_CODES)[number];
export type RejectionReasonCode = (typeof REJECTION_REASON_CODES)[number];
export type PartnerCorrectionField = (typeof PARTNER_CORRECTION_FIELDS)[number];

export type CounterpartyDirectoryRow = {
  external1cId: string;
  externalCode: string | null;
  name: string;
  normalizedName: string;
  fiscalCode: string | null;
  normalizedFiscalCode: string | null;
  isActive: boolean;
  isDeleted: boolean;
  phone: string | null;
  normalizedPhone: string | null;
  email: string | null;
  normalizedEmail: string | null;
  locality: string | null;
  assignedManagerExternalId: string | null;
  assignedManagerName: string | null;
  sourceUpdatedAt: string | null;
};

export type CounterpartyContractRow = {
  counterpartyExternal1cId: string;
  external1cId: string;
  code: string | null;
  name: string;
  number: string | null;
  date: string | null;
  contractType: string | null;
  organizationExternal1cId: string | null;
  currencyExternal1cId: string | null;
  signed: boolean | null;
  isDefault: boolean;
  priceTypeExternal1cId: string | null;
  isActive: boolean;
  isDeleted: boolean;
};

export type CounterpartyPriceProfileRow = {
  counterpartyExternal1cId: string;
  external1cId: string;
  code: string | null;
  name: string;
  isActive: boolean;
  isDeleted: boolean;
};

export type CounterpartyDirectorySnapshot = {
  complete: boolean;
  fetchedCounterpartyRows: number;
  sourceCounterpartyRows: number;
  counterparties: CounterpartyDirectoryRow[];
  contracts: CounterpartyContractRow[];
  priceProfiles: CounterpartyPriceProfileRow[];
  pagesProcessed: number;
  failedRecords: number;
  skippedCounterpartyRows: number;
  duplicateCounterpartyRows: number;
};

export type CounterpartyDirectoryCounts = {
  syncId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sourceCounterparties: number;
  fetchedCounterparties: number;
  stagedCounterparties: number;
  skippedCounterparties: number;
  malformedFiscalCodes: number;
  normalizedFiscalCodesChanged: number;
  duplicateCounterpartyRows: number;
  pagesProcessed: number;
  active: number;
  inactive: number;
  deleted: number;
  withFiscalCode: number;
  withoutFiscalCode: number;
  duplicateFiscalCodes: number;
  contracts: number;
  priceTypeRelationships: number;
  portalLinked: number;
  unresolvedManagerReferences: number;
  published: number;
  failedRecords: number;
};

export type OnboardingHealth = {
  allowed: boolean;
  directory?: {
    sync_id: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    source_counterparties: number;
    published_counterparties: number;
    duplicate_fiscal_codes: number;
    failed_records: number;
    unresolved_manager_references: number;
    safe_error_code: string | null;
    lock_acquired_at: string | null;
    fetched_counterparties: number;
    staged_counterparties: number;
    skipped_counterparties: number;
    without_fiscal_code: number;
    malformed_fiscal_codes: number;
    normalized_fiscal_codes_changed: number;
    duplicate_counterparty_rows: number;
    pages_processed: number;
    duration_ms: number;
  } | null;
  queue?: {
    new: number;
    unassigned: number;
    overdue: number;
    matchConflicts: number;
    awaitingOneCCompany: number;
  };
};

export type OnboardingQueueRow = {
  id: string;
  onboarding_status: OnboardingStatus;
  created_at: string;
  company_name: string;
  fiscal_code: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  assigned_manager_user_id: string | null;
  assigned_manager: string | null;
  match_state: string;
  sla_state: string;
  duplicate_fiscal_code: boolean;
  next_action: string;
  revision_count: number;
  assignment_age_seconds: number | null;
  clarification_age_seconds: number | null;
  partner_response_overdue: boolean;
  sla_paused: boolean;
};

export type OnboardingQueue = {
  rows: OnboardingQueueRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  statusCounters: Record<string, number>;
  slaCounters: {
    newToday: number;
    waitingOverFourHours: number;
    waitingOverOneDay: number;
    awaitingPartnerResponse: number;
    awaitingOneCCompany: number;
    readyForApproval: number;
    unassigned: number;
  };
  managers: Array<{ id: string; name: string; workloadCount: number }>;
  directoryFreshness: {
    status: string;
    synchronizedAt: string | null;
    stale: boolean;
  } | null;
};

export type OnboardingDetail = {
  request: {
    id: string;
    status: OnboardingStatus;
    createdAt: string;
    lastActivityAt: string;
    assignedManager: string | null;
    reviewStartedAt: string | null;
    initialAccessProfile: string | null;
  };
  revision: {
    revisionNumber: number;
    companyName: string;
    fiscalCode: string | null;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    message: string | null;
    locality: string | null;
    businessType: string | null;
    businessActivity: string | null;
    estimatedPurchasingVolume: string | null;
    submittedAt: string;
  };
  sla: {
    firstReviewDue: string;
    finalDecisionDue: string;
    paused: boolean;
  };
  events: Array<{
    event: string;
    previousStatus: string | null;
    nextStatus: string | null;
    occurredAt: string;
    actor: string | null;
  }>;
  candidates: Array<{
    id: string;
    external1cId: string;
    externalCode: string | null;
    companyName: string;
    fiscalCode: string | null;
    active: boolean;
    locality: string | null;
    assignedManager: string | null;
    contractCount: number;
    priceProfileCount: number;
    portalLinkageState: string;
    synchronizedAt: string;
    matchReason: string;
    published: boolean;
    fiscalCodeState: "valid" | "missing" | "malformed";
    contracts: Array<{
      name: string;
      code: string | null;
    }>;
    priceProfiles: Array<{
      id: string;
      name: string;
      code: string | null;
    }>;
  }>;
  duplicates: {
    sameFiscalCode: boolean;
    sameEmail: boolean;
    existingMembership: boolean;
    userLinkedToAnotherCompany: boolean;
  };
  managers: Array<{ id: string; name: string; workloadCount: number }>;
  directoryFiscalMatchCount: number;
  draft: {
    requestRevisionNumber: number;
    confirmedCounterpartyId: string | null;
    assignedManagerId: string | null;
    selectedPriceProfileId: string | null;
    paymentModel: string | null;
    initialBusinessProfile: string | null;
    financeAccess: boolean;
    orderAccess: boolean;
    currentStep: number;
    version: number;
    attemptKey: string;
    updatedAt: string;
    stale: boolean;
  } | null;
  workflow: {
    clarification: {
      reasonCategory: ClarificationReasonCode;
      partnerMessage: string;
      fields: PartnerCorrectionField[];
      responseDeadline: string | null;
      internalNote: string | null;
      requestedAt: string | null;
      responseOverdue: boolean;
    } | null;
    rejection: {
      reasonCategory: RejectionReasonCode;
      partnerMessage: string;
      internalNote: string | null;
    } | null;
    assignedManagerId: string | null;
    assignmentAgeSeconds: number | null;
    revisionCount: number;
    reopenedCount: number;
    managerWorkload: number;
    isPlatformAdmin: boolean;
  };
  companyVerification: {
    outcome: OnboardingCompanyVerificationOutcome;
    matchOutcome: OnboardingDirectoryMatchOutcome;
    exactCandidateCount: number;
    exactCandidateIds: string[];
    lastSuccessfulDirectorySyncAt: string | null;
    directoryFreshness: "fresh" | "stale" | "failed" | "unavailable";
    latestSyncStatus: string | null;
    waitingSince: string | null;
    waitingInternalNote: string | null;
    blocked: boolean;
    reason: string;
    responsibleParty: string;
    nextAction: string;
  };
};

export type OnboardingCompanyVerificationContext = {
  latestStatus: string | null;
  latestStartedAt: string | null;
  latestFinishedAt: string | null;
  latestSafeErrorCode: string | null;
  lastSuccessfulAt: string | null;
  waitingSince: string | null;
  waitingInternalNote: string | null;
};

export type OnboardingDetailRecord = Omit<OnboardingDetail, "companyVerification"> & {
  companyVerificationContext: OnboardingCompanyVerificationContext;
};

export type PartnerOnboardingStatusCenter = {
  status: OnboardingStatus;
  companyName: string;
  revisionNumber: number;
  revisionSubmittedAt: string;
  currentValues: {
    companyName: string;
    fiscalCode: string | null;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    locality: string | null;
    businessType: string | null;
    businessActivity: string | null;
    estimatedPurchasingVolume: string | null;
    comment: string | null;
  };
  partnerMessage: string | null;
  requestedFields: PartnerCorrectionField[];
  responseDeadline: string | null;
  canUpdate: boolean;
  canCancel: boolean;
  hasActiveMembership: boolean;
  timeline: Array<{
    event: string;
    status: string | null;
    occurredAt: string;
  }>;
};

export type OnboardingApprovalResult = {
  success: boolean;
  idempotent?: boolean;
  companyBranch?: "created" | "reused";
  membershipOutcome?: "created" | "reused";
  failureCode?: string;
  correlationId?: string;
  failingStage?: string;
  sqlState?: string;
  safeError?: string;
};
