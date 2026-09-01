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

export const COMMERCIAL_RATE_VERIFICATION_STATUSES = [
  "NOT_VERIFIED",
  "MATCHES_1C",
  "DIFFERS_FROM_1C",
  "VERIFIED_NO_CHANGE_REQUIRED",
] as const;

export type CommercialRateVerificationStatus =
  (typeof COMMERCIAL_RATE_VERIFICATION_STATUSES)[number];

export type CommercialRateVerification = {
  id: string;
  purpose: CommercialRatePurpose;
  portalRateId: string;
  activePortalRate: number;
  activePortalEffectiveDate: string;
  observed1cRate: number;
  observed1cEffectiveDate: string;
  evidenceNote: string;
  verificationComment: string | null;
  verificationStatus: Exclude<CommercialRateVerificationStatus, "NOT_VERIFIED">;
  verifiedBy: string;
  verifiedAt: string;
  verifierName: string | null;
  verifierEmail: string | null;
};

export type VerifyCommercialRateInput = {
  purpose: CommercialRatePurpose;
  observed1cRate: string;
  observed1cEffectiveDate: string;
  evidenceNote: string;
  verificationComment?: string | null;
};

export type CommercialRateVerificationResult = {
  verification: CommercialRateVerification;
  verificationOutcome: "saved" | "unchanged";
  publicationOutcome?: "published" | "unchanged";
  rate?: CommercialRate;
};
