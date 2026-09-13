import type { AdminMerchandisingAssignment } from "../merchandising/types";

export type CatalogQualityFlag =
  | "MISSING_IMAGE"
  | "MISSING_CATEGORY"
  | "MISSING_BRAND"
  | "MISSING_PRICE"
  | "STOCK_UNKNOWN"
  | "HIDDEN_BY_PORTAL"
  | "INACTIVE_IN_1C";

export type CatalogManagementFilter =
  | "ALL"
  | "PUBLISHED"
  | "HIDDEN"
  | CatalogQualityFlag
  | "NEEDS_ATTENTION";

export type AdminCatalogProduct = {
  id: string;
  external1cId: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  imageOriginalUrl: string | null;
  categoryName: string | null;
  brandName: string | null;
  isActiveIn1C: boolean;
  isVisible: boolean;
  isPublished: boolean;
  hiddenReason: string | null;
  hiddenBy: string | null;
  hiddenAt: string | null;
  hasPartnerPrice: boolean;
  hasRetailPrice: boolean;
  stockState: "in_stock" | "zero" | "unknown";
  availableQuantity: number | null;
  issues: CatalogQualityFlag[];
  assignments: AdminMerchandisingAssignment[];
};

export type CatalogManagementCounters = Record<
  | "ALL"
  | "PUBLISHED"
  | "HIDDEN"
  | "MISSING_IMAGE"
  | "MISSING_CATEGORY"
  | "MISSING_BRAND"
  | "MISSING_PRICE"
  | "STOCK_UNKNOWN"
  | "NEEDS_ATTENTION",
  number
>;

export type CatalogImageFailure = {
  correlationId: string;
  productId: string;
  productRef: string;
  stage: string;
  safeErrorCode: string | null;
  cleanupStatus: string;
  updatedAt: string;
};

export type CatalogManagementPage = {
  counters: CatalogManagementCounters;
  totalCount: number;
  items: AdminCatalogProduct[];
  recentImageFailures: CatalogImageFailure[];
  page: number;
  pageSize: number;
};

export type CatalogVisibilityResult = {
  productId: string;
  visible: boolean;
  isActiveIn1C: boolean;
  changed: boolean;
};

export type CatalogImageUploadResult = {
  productId: string;
  imageUrl: string;
  correlationId: string;
  replaced: boolean;
  cleanupStatus: string;
};
