import type {
  AdminCompanyFilter,
  AdminCompanyOverview,
  AdminCompanyPage,
  AdminCompanyAccess,
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
  updateAccess(input: {
    companyId: string;
    expectedVersion: number;
    presetCode: PartnerAccessPresetCode;
    enabledPermissionCodes: string[];
    note: string | null;
    correlationId: string;
  }): Promise<{ version: number; correlationId: string }>;
}
