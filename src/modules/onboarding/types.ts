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
  sourceCounterpartyRows: number;
  counterparties: CounterpartyDirectoryRow[];
  contracts: CounterpartyContractRow[];
  priceProfiles: CounterpartyPriceProfileRow[];
  pagesProcessed: number;
  failedRecords: number;
};

export type CounterpartyDirectoryCounts = {
  syncId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sourceCounterparties: number;
  stagedCounterparties: number;
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
  managers: Array<{ id: string; name: string }>;
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
  }>;
  duplicates: {
    sameFiscalCode: boolean;
    sameEmail: boolean;
    existingMembership: boolean;
    userLinkedToAnotherCompany: boolean;
  };
  managers: Array<{ id: string; name: string }>;
};
