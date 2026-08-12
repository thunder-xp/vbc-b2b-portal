import type { PublicRetailCartDto, PublicRetailCartMutationDto, PublicRetailLocale } from "../types";

export type RetailCartProductCommand = { publicProductId: string; quantity: number; source: "catalog" | "product_detail"; requestId: string; fingerprint: string };
export type RetailCartBundleCommand = { items: Array<{ publicProductId: string; quantity: number; commercialGroup: "equipment" | "materials" }>; installationIntent: Record<string, boolean> | null; requestId: string; fingerprint: string };
export interface RetailCartRepository {
  getCart(tokenHash: string, locale: PublicRetailLocale): Promise<PublicRetailCartDto | null>;
  getSummary(tokenHash: string): Promise<{ distinctItemCount: number; totalQuantity: number }>;
  addProduct(tokenHash: string, command: RetailCartProductCommand): Promise<PublicRetailCartMutationDto>;
  addBundle(tokenHash: string, command: RetailCartBundleCommand): Promise<PublicRetailCartMutationDto>;
  updateQuantity(tokenHash: string, input: { publicProductId: string; bundleId: string | null; quantity: number; expectedRevision: number }): Promise<PublicRetailCartMutationDto>;
  removeItem(tokenHash: string, input: { publicProductId: string; bundleId: string | null; expectedRevision: number }): Promise<PublicRetailCartMutationDto>;
}
