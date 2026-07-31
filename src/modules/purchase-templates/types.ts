export type PurchaseTemplateVisibility = "private" | "company";
export type PurchaseTemplateStatus = "active" | "archived";
export type PurchaseTemplateSourceType = "manual" | "cart" | "order" | "purchasing_list" | "dashboard_reorder";
export type PurchaseTemplateLineState =
  | "available"
  | "low_stock"
  | "quantity_exceeds_available"
  | "unavailable"
  | "expected"
  | "price_unavailable"
  | "unpublished"
  | "access_restricted";

export type PurchaseTemplate = {
  id: string;
  companyId: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  visibility: PurchaseTemplateVisibility;
  status: PurchaseTemplateStatus;
  sourceType: PurchaseTemplateSourceType;
  sourceId: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type PurchaseTemplateItem = {
  id: string;
  templateId: string;
  productId: string;
  preferredQuantity: number;
  lineNote: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseTemplateLineDto = PurchaseTemplateItem & {
  sku: string | null;
  productName: string | null;
  slug: string | null;
  imageUrl: string | null;
  currentUnitPrice: string | null;
  currentUnitPriceAmount: number | null;
  currentCurrencyCode: string | null;
  lineTotal: string | null;
  availableQuantity: number | null;
  expectedArrivalDate: string | null;
  expectedArrivalQuantity: number | null;
  state: PurchaseTemplateLineState;
  stateLabel: string;
  eligible: boolean;
};

export type PurchaseTemplateSummaryDto = PurchaseTemplate & {
  ownerName: string;
  itemCount: number;
  totalQuantity: number;
  warningCount: number;
  totals: Array<{ currencyCode: string; amount: number; formatted: string }>;
  canEdit: boolean;
};

export type PurchaseTemplateDetailDto = PurchaseTemplate & {
  ownerName: string;
  canEdit: boolean;
  lines: PurchaseTemplateLineDto[];
  summary: PurchaseTemplatePreviewSummary;
};

export type PurchaseTemplatePreviewSummary = {
  totalPositions: number;
  eligible: number;
  unavailable: number;
  expected: number;
  unpublished: number;
  restricted: number;
  priceUnavailable: number;
  quantityExceedsStock: number;
  totals: Array<{ currencyCode: string; amount: number; formatted: string }>;
};

export type PurchaseTemplatePageDto = {
  records: PurchaseTemplateSummaryDto[];
  page: number;
  totalPages: number;
  totalCount: number;
};

export type PurchaseTemplateCartResultDto = {
  repeated: boolean;
  cartId: string | null;
  added: number;
  merged: number;
  skipped: number;
  unavailable: number;
  restricted: number;
  failed: number;
};
