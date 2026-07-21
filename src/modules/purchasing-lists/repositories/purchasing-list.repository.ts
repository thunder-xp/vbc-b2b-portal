import type { PurchasingList, PurchasingListItem, PurchasingListSourceType, PurchasingListVisibility } from "../types";

export type PurchasingListRecord = PurchasingList & { ownerName: string; items: PurchasingListItem[] };
export type PurchasingListIndexRecord = PurchasingList & { ownerName: string; itemCount: number; totalQuantity: number; productIds: string[] };
export type PurchasingListItemInput = { productId: string; quantity: number; note?: string | null; sourceReferenceId?: string | null; sourceUnitPrice?: number | null; sourceCurrencyCode?: string | null };

export interface PurchasingListRepository {
  list(input: { companyId: string; search: string | null; visibility: PurchasingListVisibility | null; mine: boolean; archived: boolean; limit: number; offset: number }): Promise<{ records: PurchasingListIndexRecord[]; totalCount: number }>;
  listFavoriteProductIds(companyId: string, productIds: string[]): Promise<string[]>;
  setFavorite(companyId: string, productId: string, saved: boolean): Promise<{ saved: boolean; listId: string | null }>;
  findById(listId: string): Promise<PurchasingListRecord | null>;
  create(input: { companyId: string; name: string; description: string | null; visibility: PurchasingListVisibility; sourceType: PurchasingListSourceType; sourceReferenceId: string | null; items: PurchasingListItemInput[] }): Promise<PurchasingList>;
  updateMetadata(input: { listId: string; expectedRevision: number; name: string; description: string | null; visibility: PurchasingListVisibility }): Promise<PurchasingList>;
  mergeItems(input: { listId: string; expectedRevision: number; mergeMode: "increase" | "replace" | "keep"; sourceType: PurchasingListSourceType; sourceReferenceId: string | null; items: PurchasingListItemInput[] }): Promise<PurchasingList>;
  updateItems(input: { listId: string; expectedRevision: number; items: Array<{ itemId: string; quantity: number; position: number; note: string | null }> }): Promise<PurchasingList>;
  removeItems(input: { listId: string; expectedRevision: number; itemIds: string[] }): Promise<PurchasingList>;
  setArchived(input: { listId: string; expectedRevision: number; archived: boolean }): Promise<PurchasingList>;
  duplicate(input: { listId: string; name: string }): Promise<PurchasingList>;
  mergeIntoCart(input: { listId: string; requestKey: string; requestFingerprint: string; items: Array<{ itemId: string; productId: string; quantity: number }>; summary: Record<string, number> }): Promise<{ cartId: string; repeated: boolean }>;
}

export class PurchasingListRepositoryError extends Error {
  constructor(readonly code: string | null = null) { super("Purchasing list persistence failed."); this.name = "PurchasingListRepositoryError"; }
}
