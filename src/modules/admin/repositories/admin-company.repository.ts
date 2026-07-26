import type {
  AdminCompanyFilter,
  AdminCompanyOverview,
  AdminCompanyPage,
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
}
