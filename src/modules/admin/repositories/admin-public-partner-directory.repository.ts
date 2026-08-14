import type {
  AdminPublicPartnerDirectoryPage,
  AdminPublicPartnerFilter,
  UpdateAdminPublicPartnerDirectoryResult,
} from "../types";

export interface AdminPublicPartnerDirectoryRepository {
  list(input: {
    page: number;
    pageSize: number;
    search: string;
    filter: AdminPublicPartnerFilter;
  }): Promise<Omit<AdminPublicPartnerDirectoryPage, "totalPages" | "search" | "filter">>;
  update(input: {
    companyId: string;
    expectedRevision: number;
    publicDisplayName: string;
    visible: boolean;
    useCurrentLogo: boolean;
    correlationId: string;
  }): Promise<UpdateAdminPublicPartnerDirectoryResult>;
}
