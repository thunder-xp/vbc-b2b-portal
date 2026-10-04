import type { ProductPrice } from "./price";

/** Source-price provenance; settlement/FX evidence uses the existing order columns. */
export type EffectivePriceEvidence = {
  priceSource: "PARTNER" | "CAMPAIGN_PROMO";
  priceTypeRef: string;
  priceId: string;
  sourceAmount: number;
  sourceCurrency: "USD" | "MDL";
  campaignId?: string;
  campaignItemId?: string;
  publicationVersion?: number;
  mechanicType?: "quantity_threshold_promo" | "fixed_bundle_promo" | "conditional_attach_promo";
  attachRole?: "REWARD";
  thresholdQuantity?: number;
  requiredBundleQuantity?: number;
};

export type EffectiveCartPrice = {
  productId: string;
  quantity: number;
  price: ProductPrice | null;
  evidence: EffectivePriceEvidence | null;
};

export class EffectiveCommercialPriceChangedError extends Error {
  constructor() {
    super("Commercial conditions changed. Review the cart before checkout.");
    this.name = "EffectiveCommercialPriceChangedError";
  }
}
