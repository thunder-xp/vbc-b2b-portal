export const ADMIN_COMPANY_FILTERS = [
  "all",
  "active",
  "pending_access",
  "missing_1c_mapping",
  "no_active_owner",
  "suspended",
  "finance_sync_failed",
  "commercial_data_stale",
] as const;

export type AdminCompanyFilter = (typeof ADMIN_COMPANY_FILTERS)[number];

export type AdminCompanySummary = {
  companyId: string;
  displayName: string;
  fiscalCode: string | null;
  companyStatus: string;
  counterpartyMappingState: string;
  organizationMappingState: string;
  activeMembershipCount: number;
  activeOwnerCount: number;
  pendingInvitationCount: number;
  partnerPriceType: string | null;
  financeSyncState: string;
  commercialState: string;
  lastCommercialAt: string | null;
  warningCodes: string[];
};

export type AdminCompanyPage = {
  records: AdminCompanySummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  search: string;
  filter: AdminCompanyFilter;
};

export type AdminCompanyOverview = {
  companyId: string;
  displayName: string;
  fiscalCode: string | null;
  companyStatus: string;
  external1cId: string | null;
  external1cCode: string | null;
  external1cContractId: string | null;
  external1cPriceTypeId: string | null;
  partnerPriceType: string | null;
  organizationMappingState: string;
  activeMembershipCount: number;
  activeOwnerCount: number;
  pendingInvitationCount: number;
  activeOwnerName: string | null;
  financeSyncState: string;
  financeLastSuccessAt: string | null;
  latestAccessEventType: string | null;
  latestAccessEventAt: string | null;
  warningCodes: string[];
};

export const CONTRACT_MAPPING_RESULT_CODES = [
  "CONTRACT_MAPPING_SUCCESS",
  "CONTRACT_NOT_FOUND",
  "CONTRACT_NOT_OWNED_BY_COMPANY",
  "CONTRACT_INACTIVE",
  "CONTRACT_INVALID_TYPE",
  "CONTRACT_ORGANIZATION_MISMATCH",
  "CONTRACT_PRICE_TYPE_MISMATCH",
  "CONTRACT_PRICE_TYPE_MISSING",
  "CONTRACT_PRICE_TYPE_INVALID",
  "CONTRACT_PRICE_TYPE_CURRENCY_MISMATCH",
  "CONTRACT_SETTLEMENT_CURRENCY_MISSING",
  "CONTRACT_MAPPING_CONFLICT",
  "CONTRACT_MAPPING_FAILED",
] as const;

export type ContractMappingResultCode = (typeof CONTRACT_MAPPING_RESULT_CODES)[number];

export type AdminContractCandidate = {
  external1cId: string;
  code: string | null;
  name: string;
  number: string | null;
  date: string | null;
  contractType: string | null;
  organizationRef: string | null;
  signed: boolean | null;
  active: boolean;
  deleted: boolean;
  priceTypeRef: string | null;
  priceTypeName: string | null;
  settlementCurrencyCode: string | null;
  settlementCurrencyRef: string | null;
  priceCurrencyCode: string | null;
  priceCurrencyRef: string | null;
  selectable: boolean;
  qualificationCode: ContractCandidateQualificationCode;
  default: boolean;
  synchronizedAt: string;
  cashQualified: boolean;
  cashQualificationCode: CashContractQualificationCode;
};

export type ContractCandidateQualificationCode =
  | "CONTRACT_QUALIFIED"
  | "CONTRACT_NOT_FOUND"
  | "CONTRACT_NOT_OWNED_BY_COMPANY"
  | "CONTRACT_INACTIVE"
  | "CONTRACT_INVALID_TYPE"
  | "CONTRACT_ORGANIZATION_MISMATCH"
  | "CONTRACT_PRICE_TYPE_MISSING"
  | "CONTRACT_PRICE_TYPE_INVALID"
  | "CONTRACT_PRICE_TYPE_CURRENCY_MISMATCH"
  | "CONTRACT_SETTLEMENT_CURRENCY_MISSING";

export const CASH_CONTRACT_RESULT_CODES = [
  "CASH_CONTRACT_MAPPING_SUCCESS",
  "CASH_COMPANY_INACTIVE",
  "CASH_CONTRACT_NOT_FOUND",
  "CASH_CONTRACT_NOT_OWNED_BY_COMPANY",
  "CASH_CONTRACT_INACTIVE",
  "CASH_CONTRACT_INVALID_TYPE",
  "CASH_CONTRACT_ORGANIZATION_MISMATCH",
  "CASH_CONTRACT_PRICE_TYPE_MISSING",
  "CASH_CONTRACT_PRICE_TYPE_INVALID",
  "CASH_CONTRACT_PRICE_TYPE_CURRENCY_MISMATCH",
  "CASH_CONTRACT_CURRENCY_MISSING",
  "CASH_CONTRACT_CURRENCY_MISMATCH",
  "CASH_CONTRACT_MAPPING_CONFLICT",
  "CASH_CONTRACT_MAPPING_FAILED",
] as const;

export type CashContractResultCode = (typeof CASH_CONTRACT_RESULT_CODES)[number];
export type CashContractQualificationCode =
  | "CASH_CONTRACT_QUALIFIED"
  | Exclude<CashContractResultCode, "CASH_CONTRACT_MAPPING_SUCCESS" | "CASH_CONTRACT_MAPPING_CONFLICT" | "CASH_CONTRACT_MAPPING_FAILED">;

export type AdminCashContractMapping = {
  contractRole: "cash";
  contractRef: string | null;
  active: boolean;
  version: number;
  reason: string | null;
  updatedAt: string | null;
  qualificationCode: CashContractQualificationCode | "CASH_MAPPING_MISSING" | "CASH_MAPPING_REMOVED";
  qualified: boolean;
  events: Array<{
    id: string;
    eventType: "mapped" | "changed" | "removed";
    previousContractRef: string | null;
    newContractRef: string | null;
    reason: string;
    occurredAt: string;
    mappingVersion: number;
    qualificationCode: string | null;
  }>;
};

export type AdminCompanyContractMappingProjection = {
  companyId: string;
  counterpartyRef: string | null;
  currentContractRef: string | null;
  currentPriceTypeRef: string | null;
  currentPriceTypeName: string | null;
  currentCurrencyCode: string | null;
  commercialProfileState: "never_verified" | "aligned" | "mismatch" | "contract_missing" | "contract_invalid" | "price_type_unknown" | "price_data_stale";
  commercialProfileVersion: number;
  commercialProfileVerifiedAt: string | null;
  priceSnapshotAt: string | null;
  publishedPriceCount: number;
  version: number;
  canManage: boolean;
  canSync: boolean;
  suggestedContractRef: string | null;
  suggestedCashContractRef: string | null;
  defaultContractAmbiguous: boolean;
  readiness: AdminCommercialReadinessProjection;
  cashMapping: AdminCashContractMapping;
  candidates: AdminContractCandidate[];
};

export type AdminCommercialReadinessProjection = {
  class:
    | "READY"
    | "REPAIRABLE_STALE_PROFILE"
    | "MISSING_CANONICAL_CONTRACT"
    | "UNKNOWN_PRICE_TYPE"
    | "UNVERIFIED_PROFILE"
    | "NO_PAYMENT_PATH"
    | "DIRECTORY_CONFLICT";
  paymentPathClass: "PAYMENT_PATH_READY" | "NO_PAYMENT_PATH";
  ready: boolean;
  repairable: boolean;
  severity: "none" | "high" | "medium" | "low";
  activeCartItemCount: number;
  lastOrderAt: string | null;
  lastVerifiedAt: string | null;
  commercialConsequence: string;
  requiredAction: string;
};

export const COMMERCIAL_PROFILE_SYNC_RESULT_CODES = [
  "COMMERCIAL_PROFILE_SYNC_SUCCESS",
  "COMMERCIAL_PROFILE_MISMATCH",
  "COMMERCIAL_CONTRACT_MISSING",
  "COMMERCIAL_CONTRACT_INVALID",
  "COMMERCIAL_PRICE_TYPE_MISSING",
  "COMMERCIAL_PRICE_TYPE_UNKNOWN",
  "COMMERCIAL_PRICE_DATA_STALE",
  "COMMERCIAL_CURRENCY_MISMATCH",
  "COMMERCIAL_PROFILE_SYNC_FAILED",
] as const;

export type CommercialProfileSyncResultCode =
  (typeof COMMERCIAL_PROFILE_SYNC_RESULT_CODES)[number];

export type AdminCommercialProfileSyncResult = {
  code: CommercialProfileSyncResultCode;
  correlationId: string;
  version?: number;
  claimed?: boolean;
  runId?: string;
  companyId?: string;
  counterpartyRef?: string;
  contractRef?: string;
  previousPriceTypeRef?: string | null;
  nextPriceTypeRef?: string | null;
  derivedStatus?: string;
  currencyCode?: string;
  unchanged?: boolean;
  idempotent?: boolean;
  inProgress?: boolean;
};

export type AdminContractMappingResult = {
  code: ContractMappingResultCode;
  correlationId: string;
  contractRef?: string;
  currentContractRef?: string | null;
  currentPriceTypeRef?: string | null;
  selectedPriceTypeRef?: string | null;
  version?: number;
  unchanged?: boolean;
};

export type AdminCashContractMappingResult = {
  code: CashContractResultCode;
  correlationId: string;
  contractRef?: string | null;
  version?: number;
  unchanged?: boolean;
};

export const PARTNER_ACCESS_PRESETS = [
  "full_partner_access",
  "orders_only",
  "catalog_only",
  "custom",
] as const;

export type PartnerAccessPresetCode = (typeof PARTNER_ACCESS_PRESETS)[number];

export type AdminCompanyCapability = {
  code: string;
  description: string;
  category: string;
  enabled: boolean;
};

export type AdminCompanyAccess = {
  companyId: string;
  presetCode: PartnerAccessPresetCode;
  version: number;
  changedAt: string;
  changedBy: string | null;
  changeNote: string | null;
  canManage: boolean;
  presets: Array<{
    code: PartnerAccessPresetCode;
    name: string;
    permissionCodes: string[];
  }>;
  capabilities: AdminCompanyCapability[];
  recentEvents: Array<{
    eventType: string;
    presetCode: PartnerAccessPresetCode;
    version: number;
    note: string | null;
    occurredAt: string;
    actorName: string | null;
  }>;
};
