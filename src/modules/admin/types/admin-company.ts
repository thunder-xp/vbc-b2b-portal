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
  currencyCode: string | null;
  default: boolean;
  synchronizedAt: string;
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
  candidates: AdminContractCandidate[];
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
