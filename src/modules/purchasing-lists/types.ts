import type { CommercialProductState } from "../pricing-inventory/services";

export type PurchasingListVisibility = "private" | "company";
export type PurchasingListSourceType = "manual" | "catalog" | "cart" | "order" | "quick_reorder" | "duplicate";
export type PurchasingList = { id: string; companyId: string; name: string; description: string | null; visibility: PurchasingListVisibility; createdBy: string; updatedBy: string; revision: number; createdAt: string; updatedAt: string; archivedAt: string | null };
export type PurchasingListItem = { id: string; listId: string; productId: string; quantity: number; position: number; note: string | null; sourceType: PurchasingListSourceType; sourceReferenceId: string | null; sourceUnitPrice: number | null; sourceCurrencyCode: string | null; createdAt: string; updatedAt: string };
export type PurchasingListSummaryDto = PurchasingList & { ownerName: string; itemCount: number; totalQuantity: number; warningCount: number; canManage: boolean };
export type PurchasingListLineDto = PurchasingListItem & { sku: string; productName: string; slug: string; imageUrl: string | null; currentPartnerPrice: string | null; currentPartnerPriceAmount: number | null; currentCurrencyCode: string | null; availableStock: number | null; expectedArrivalDate: string | null; expectedArrivalQuantity: number | null; state: CommercialProductState; stateLabel: string; canConvert: boolean };
export type PurchasingListDetailDto = PurchasingList & { ownerName: string; canManage: boolean; lines: PurchasingListLineDto[] };
export type PurchasingListPageDto = { records: PurchasingListSummaryDto[]; page: number; totalPages: number; totalCount: number };
export type PurchasingListConversionResultDto = { repeated: boolean; destinationId: string | null; added: number; skipped: number; missingPrice: number; inactive: number; unavailable: number };
