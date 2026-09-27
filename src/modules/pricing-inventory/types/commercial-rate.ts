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
  publishedBy: string | null;
  publisherName: string | null;
  publisherEmail: string | null;
  sourceType: "manual_from_1c" | "one_c_automatic";
  sourceNote: string;
  evidenceComment: string | null;
  previousRateId: string | null;
  isActive: boolean;
  sourceCurrencyRef?: string | null;
  sourceCode?: string | null;
  sourceSymbolicCode?: string | null;
  sourceRawRate?: number | null;
  sourceMultiplicity?: number | null;
  sourceDataVersion?: string | null;
  sourceCheckedAt?: string | null;
};

export type CommercialRateSyncState = {
  freshnessStatus: "FRESH" | "STALE" | "FAILED" | "NEVER_SYNCED";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastSourceCheckedAt: string | null;
  lastPublishedAt: string | null;
  lastResult: "PUBLISHED" | "NO_OP" | "FAILED" | "RUNNING" | null;
  lastErrorCode: string | null;
  consecutiveFailures: number;
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
