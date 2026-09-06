import type { CommercialProductState } from "../pricing-inventory/services";
import type { LiveCommerceSelectionAddDetail, LiveCommerceSelectionProduct } from "../catalog/services/live-commerce-selection";

export type PurchasingListVisibility = "private" | "company";
export type PurchasingListSourceType = "manual" | "catalog" | "cart" | "order" | "quick_reorder" | "duplicate" | "favorite" | "legacy_favorite";
export type PurchasingList = { id: string; companyId: string; name: string; description: string | null; visibility: PurchasingListVisibility; createdBy: string; updatedBy: string; revision: number; createdAt: string; updatedAt: string; archivedAt: string | null; isSystemFavorites?: boolean };
export type PurchasingListItem = { id: string; listId: string; productId: string; quantity: number; position: number; note: string | null; sourceType: PurchasingListSourceType; sourceReferenceId: string | null; sourceUnitPrice: number | null; sourceCurrencyCode: string | null; productNameSnapshot?: string | null; productImageUrlSnapshot?: string | null; createdAt: string; updatedAt: string };
export type PurchasingListSummaryDto = PurchasingList & { ownerName: string; itemCount: number; totalQuantity: number; warningCount: number; canManage: boolean };
export type PurchasingListLineDto = Omit<
  PurchasingListItem,
  "sourceUnitPrice" | "sourceCurrencyCode"
> & {
  currentPartnerPrice?: string | null;
  currentPartnerPriceAmount?: number | null;
  currentPartnerCurrencyCode?: string | null;
  currentRetailPrice: string | null;
  currentRetailPriceAmount: number | null;
  currentRetailCurrencyCode: string | null;
  sku: string;
  productName: string;
  slug: string;
  imageUrl: string | null;
  availableStock: number | null;
  expectedArrivalDate: string | null;
  expectedArrivalQuantity: number | null;
  state: CommercialProductState;
  stateLabel: string;
  canConvert: boolean;
};
export type PurchasingListDetailDto = PurchasingList & { ownerName: string; canManage: boolean; lines: PurchasingListLineDto[] };
export type PurchasingListPageDto = { records: PurchasingListSummaryDto[]; page: number; totalPages: number; totalCount: number };
export type PurchasingListConversionResultDto = { repeated: boolean; destinationId: string | null; added: number; skipped: number; missingPrice: number; inactive: number; unavailable: number };

export type LiveCommerceKitSummaryDto = {
  id: string;
  name: string;
  itemCount: number;
  totalQuantity: number;
  updatedAt: string;
  revision: number;
  canManage: boolean;
};

export type LiveCommerceKitLineStatus = "READY" | "PRICE_UNAVAILABLE" | "PRODUCT_INACTIVE" | "UNAVAILABLE";

export type LiveCommerceKitLineDto = {
  itemId: string;
  productId: string;
  productName: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  position: number;
  status: LiveCommerceKitLineStatus;
  currentPrice: string | null;
  currentStock: number | null;
  product: LiveCommerceSelectionProduct | null;
};

export type LiveCommerceKitDetailDto = LiveCommerceKitSummaryDto & {
  description: string | null;
  visibility: PurchasingListVisibility;
  lines: LiveCommerceKitLineDto[];
  readyCount: number;
  attentionCount: number;
};

export type LiveCommerceKitBatchDto = {
  items: LiveCommerceSelectionAddDetail[];
  readyCount: number;
  attentionCount: number;
};
