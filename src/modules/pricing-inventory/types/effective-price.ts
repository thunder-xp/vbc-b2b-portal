import type { ProductPrice } from "./price";

/** Source-price provenance; settlement/FX evidence uses the existing order columns. */
export type EffectivePriceEvidence = {
  commercialSource?: "STANDARD" | "CAMPAIGN";
  priceSource: "PARTNER" | "CAMPAIGN_PROMO" | "CAMPAIGN_SPECIAL_PRICE";
  priceTypeRef: string;
  priceId: string;
  sourceAmount: number;
  sourceCurrency: "USD" | "MDL";
  campaignId?: string;
  campaignItemId?: string;
  publicationVersion?: number;
  mechanicType?: import("../../commercial-campaigns/types").CampaignMechanicType;
  spendRole?: "REWARD";
  spendConfig?: import("../../commercial-campaigns/types").SpendThresholdPromoConfig;
  qualifyingSpendUsd?: string;
  qualifyingSources?: Array<{ productId: string; quantity: number; priceId: string; sourceAmountUsd: string }>;
  attachRole?: "REWARD";
  thresholdQuantity?: number;
  requiredBundleQuantity?: number;
};

export type EffectiveCartPrice = {
  cartItemId: string;
  commercialSource: "STANDARD" | "CAMPAIGN";
  campaignContext: CartCampaignContext | null;
  productId: string;
  quantity: number;
  price: ProductPrice | null;
  evidence: EffectivePriceEvidence | null;
};

export type CartCampaignContext = {
  campaignId: string;
  campaignItemId: string;
  publicationVersion: number;
  mechanicType: import("../../commercial-campaigns/types").CampaignMechanicType;
  eligible: boolean;
  reason: string;
  thresholdQuantity: number | null;
  requestedQuantity: number;
  progress: {
    components?: Array<{ missingQuantity: number }>;
    triggers?: Array<{ missingQuantity: number }>;
    remainingSpendUsd?: string;
  } | null;
};

export class EffectiveCommercialPriceChangedError extends Error {
  constructor() {
    super("Commercial conditions changed. Review the cart before checkout.");
    this.name = "EffectiveCommercialPriceChangedError";
  }
}
