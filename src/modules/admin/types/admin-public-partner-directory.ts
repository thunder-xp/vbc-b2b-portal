import type {
  PublicPartnerCapabilityCode,
  PublicPartnerCapabilityEvidence,
} from "@/src/modules/public-retail/types";

export const ADMIN_PUBLIC_PARTNER_FILTERS = [
  "all",
  "visible",
  "hidden",
  "missing_logo",
  "missing_public_name",
  "incomplete",
  "name_review",
] as const;

export type AdminPublicPartnerFilter = (typeof ADMIN_PUBLIC_PARTNER_FILTERS)[number];

export type AdminPublicPartnerDirectoryRecord = {
  companyId: string;
  companyName: string;
  publicDisplayName: string | null;
  publicSlug: string | null;
  descriptionRu: string | null;
  descriptionRo: string | null;
  locality: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  publicWebsite: string | null;
  capabilities: Array<{
    code: PublicPartnerCapabilityCode;
    evidenceStatus: PublicPartnerCapabilityEvidence;
  }>;
  currentLogoUrl: string | null;
  approvedLogoUrl: string | null;
  visible: boolean;
  revision: number;
  updatedAt: string | null;
  publishedAt: string | null;
  publicNameReview: boolean;
  completeness: {
    publicName: boolean;
    logo: boolean;
    descriptionRu: boolean;
    descriptionRo: boolean;
    locality: boolean;
    capabilities: boolean;
    publicContact: boolean;
    website: boolean;
  };
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
