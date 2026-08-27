export const ADMIN_PUBLIC_PARTNER_FILTERS = [
  "all",
  "visible",
  "hidden",
  "missing_logo",
  "missing_public_name",
] as const;

export type AdminPublicPartnerFilter = (typeof ADMIN_PUBLIC_PARTNER_FILTERS)[number];

export type AdminPublicPartnerDirectoryRecord = {
  companyId: string;
  companyName: string;
  publicDisplayName: string | null;
  currentLogoUrl: string | null;
  approvedLogoUrl: string | null;
  visible: boolean;
  revision: number;
  updatedAt: string | null;
  publishedAt: string | null;
};

export type AdminPublicPartnerDirectoryPage = {
  records: AdminPublicPartnerDirectoryRecord[];
  totalCount: number;
  publishedCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  search: string;
  filter: AdminPublicPartnerFilter;
};

export type UpdateAdminPublicPartnerDirectoryResult = {
  companyId: string;
  revision: number;
  visible: boolean;
  changed: boolean;
  correlationId: string;
};

export type UpdateAdminCompanyLogoResult = {
  companyId: string;
  previousLogoAssetPath: string | null;
  logoAssetPath: string | null;
  revision: number;
  visible: boolean;
  changed: boolean;
  auditEventId: string | null;
  correlationId: string;
};
