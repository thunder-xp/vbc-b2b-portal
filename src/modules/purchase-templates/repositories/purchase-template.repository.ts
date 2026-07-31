import type { PurchaseTemplate, PurchaseTemplateItem, PurchaseTemplateSourceType, PurchaseTemplateVisibility } from "../types";

export type PurchaseTemplateRecord = PurchaseTemplate & { ownerName: string; items: PurchaseTemplateItem[] };
export type PurchaseTemplateIndexRecord = PurchaseTemplate & { ownerName: string; itemCount: number; totalQuantity: number; productIds: string[]; itemIntents: Array<{ productId: string; quantity: number }> };
export type PurchaseTemplateItemInput = { productId: string; preferredQuantity: number; lineNote: string | null; sortOrder: number };

export interface PurchaseTemplateRepository {
  list(input: { companyId: string; search: string | null; filter: "all" | "mine" | "company" | "active" | "archived"; limit: number; offset: number }): Promise<{ records: PurchaseTemplateIndexRecord[]; totalCount: number }>;
  findById(templateId: string): Promise<PurchaseTemplateRecord | null>;
  create(input: { companyId: string; name: string; description: string | null; visibility: PurchaseTemplateVisibility; sourceType: PurchaseTemplateSourceType; sourceId: string | null; requestKey: string; requestFingerprint: string; items: PurchaseTemplateItemInput[] }): Promise<PurchaseTemplate>;
  update(input: { templateId: string; expectedRevision: number; name: string; description: string | null; visibility: PurchaseTemplateVisibility; items: PurchaseTemplateItemInput[] }): Promise<PurchaseTemplate>;
  archive(templateId: string, expectedRevision: number): Promise<PurchaseTemplate>;
  copy(input: { templateId: string; name: string; requestKey: string; requestFingerprint: string }): Promise<PurchaseTemplate>;
  mergeIntoCart(input: { templateId: string; requestKey: string; requestFingerprint: string; items: Array<{ itemId: string; productId: string; quantity: number }>; summary: Record<string, number> }): Promise<{ cartId: string; repeated: boolean }>;
}

export class PurchaseTemplateRepositoryError extends Error {
  constructor(readonly code: string | null = null) {
    super("Purchase template persistence failed.");
    this.name = "PurchaseTemplateRepositoryError";
  }
}
