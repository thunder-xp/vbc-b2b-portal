import type {
  AdminCompanyFilter,
  AdminCompanyOverview,
  AdminCompanyPage,
  AdminCompanyAccess,
  AdminCompanyContractMappingProjection,
  AdminCashContractMappingResult,
  AdminCommercialProfileSyncResult,
  AdminContractMappingResult,
  AdminOneCManualSyncPublishResult,
  AdminOneCManualSyncEvent,
  PartnerAccessPresetCode,
} from "../types";

export type ListAdminCompaniesRepositoryInput = {
  page: number;
  pageSize: number;
  search: string;
  filter: AdminCompanyFilter;
};

export interface AdminCompanyRepository {
  list(
    input: ListAdminCompaniesRepositoryInput,
  ): Promise<AdminCompanyPage>;
  getOverview(companyId: string): Promise<AdminCompanyOverview | null>;
  getAccess(companyId: string): Promise<AdminCompanyAccess | null>;
  getContractMapping(companyId: string): Promise<AdminCompanyContractMappingProjection | null>;
  mapContract(input: {
    companyId: string;
    contractRef: string;
    expectedVersion: number;
    reason: string;
    correlationId: string;
  }): Promise<AdminContractMappingResult>;
  mapCashContract(input: {
    companyId: string;
    contractRef: string | null;
    expectedVersion: number;
    reason: string;
    correlationId: string;
  }): Promise<AdminCashContractMappingResult>;
  beginCommercialProfileSync(input: {
    companyId: string;
    expectedVersion: number;
    reason: string;
    correlationId: string;
  }): Promise<AdminCommercialProfileSyncResult>;
  publishCommercialProfileSync(
    runId: string,
    source: import("../../integration/dto").PartnerCommercialProfileSourceDTO,
  ): Promise<AdminCommercialProfileSyncResult>;
  failCommercialProfileSync(runId: string, reason: string): Promise<void>;
  prepareManualContractSelection(input: {
    companyId: string;
    mainContractRef: string;
    cashContractRef: string | null;
    expectedContractVersion: number;
    expectedCashVersion: number;
    expectedProfileVersion: number;
    snapshot: Record<string, unknown>;
    source: import("../../integration/dto").PartnerCommercialProfileSourceDTO;
    reason: string;
    correlationId: string;
  }): Promise<string>;
  applyManualContractSelection(verificationId: string): Promise<import("../types").AdminOneCManualSyncApplyResult>;
  publishManualOneCSnapshot(input: {
    companyId: string;
    snapshot: Record<string, unknown>;
    previousValues: Record<string, unknown>;
    proposedValues: Record<string, unknown>;
    reason: string;
    correlationId: string;
  }): Promise<AdminOneCManualSyncPublishResult>;
  getManualOneCSyncEvents(companyId: string): Promise<AdminOneCManualSyncEvent[]>;
  updateAccess(input: {
    companyId: string;
    expectedVersion: number;
    presetCode: PartnerAccessPresetCode;
    enabledPermissionCodes: string[];
    note: string | null;
    correlationId: string;
  }): Promise<{ version: number; correlationId: string }>;
}
