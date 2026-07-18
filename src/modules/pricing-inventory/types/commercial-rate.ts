export const COMMERCIAL_RATE_PURPOSES = [
  "partner_price_usd_to_mdl",
  "retail_price_usd_to_mdl",
] as const;

export type CommercialRatePurpose = (typeof COMMERCIAL_RATE_PURPOSES)[number];

export type CommercialRate = {
  id: string;
  purpose: CommercialRatePurpose;
  rate: number;
  effectiveAt: string;
  publishedAt: string;
  publishedBy: string;
  publisherName: string | null;
  publisherEmail: string | null;
  sourceType: "manual_from_1c";
  sourceNote: string;
  evidenceComment: string | null;
  previousRateId: string | null;
  isActive: boolean;
};

export type CommercialRateSnapshot = {
  partnerPriceUsdToMdl: CommercialRate | null;
  retailPriceUsdToMdl: CommercialRate | null;
};

export type PublishCommercialRateInput = {
  purpose: CommercialRatePurpose;
  rate: string;
  effectiveDate: string;
  sourceNote: string;
  evidenceComment?: string | null;
};
