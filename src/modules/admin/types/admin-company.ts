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
