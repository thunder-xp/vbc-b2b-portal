export const SDUC_MECHANISM_TYPES = [
  "REORDER_DUE",
  "BACK_IN_STOCK",
  "WIN_BACK",
  "GAMIFICATION",
  "CAMPAIGN",
  "REWARD",
  "VOLUME_INCENTIVE",
  "STOCK_PRESSURE",
] as const;

export type SducMechanismType = (typeof SDUC_MECHANISM_TYPES)[number];
export type SducPriceDirection = "DECREASE" | "INCREASE";
export type SducExecutionMode = "DRY_RUN" | "ACTIVE";
export type SducAuthorizationStatus =
  | "ACTIVE"
  | "CONSUMED"
  | "EXPIRED"
  | "INVALIDATED"
  | "REVOKED";

export type SducReasonCode =
  | "ELIGIBLE"
  | "DIRECTION_NOT_IMPLEMENTED"
  | "SYSTEM_NOT_ACTIVE"
  | "MECHANISM_DISABLED"
  | "NO_BASE_PRICE"
  | "INVALID_BASE_PRICE"
  | "NO_STOP_PRICE"
  | "INVALID_STOP_PRICE"
  | "CURRENCY_NOT_COMPARABLE"
  | "NO_DOWNWARD_PRICE_RESERVE"
  | "INVALID_REQUESTED_DISCOUNT"
  | "NO_ALLOWED_DISCOUNT_STEP"
  | "GLOBAL_AUTOMATION_LIMIT"
  | "MECHANISM_LIMIT"
  | "REQUEST_ABOVE_ALLOWED"
  | "PRODUCT_NOT_ELIGIBLE"
  | "COMPANY_NOT_ELIGIBLE"
  | "AUTHORIZATION_NOT_ACTIVE"
  | "AUTHORIZATION_EXPIRED"
  | "AUTHORIZATION_SCOPE_MISMATCH"
  | "BASE_PRICE_CHANGED"
  | "STOP_FLOOR_MOVED"
  | "SOURCE_VERSION_MOVED";

export interface SducDecreasePolicy {
  id: string;
  mechanismType: SducMechanismType;
  direction: SducPriceDirection;
  enabled: boolean;
  executionMode: SducExecutionMode;
  globalCeilingPercent: string | null;
  mechanismMaximumPercent: string | null;
  discountStepsPercent: readonly string[];
  stackable: boolean;
  validitySeconds: number | null;
  priority: number;
}

export interface SducDecreaseEnvelopeInput {
  basePrice: string | null;
  stopPrice: string | null;
  baseCurrency: string | null;
  stopCurrency: string | null;
  requestedDiscountPercent: string;
  policy: SducDecreasePolicy;
}

export interface SducDecreaseEnvelope {
  eligible: boolean;
  reasonCode: SducReasonCode;
  basePrice: string | null;
  stopPrice: string | null;
  currency: string | null;
  reserveAbsolute: string | null;
  reservePercent: string | null;
  allowedDiscountPercent: string | null;
  approvedDiscountPercent: string | null;
  effectivePrice: string | null;
  executionMode: SducExecutionMode;
  constraintsApplied: readonly SducReasonCode[];
}

export interface SducPriceAuthorization {
  id: string;
  companyId: string;
  productId: string;
  direction: SducPriceDirection;
  mechanismType: SducMechanismType;
  mechanismInstanceId: string;
  basePrice: string;
  stopPrice: string;
  currency: string;
  requestedDiscountPercent: string;
  approvedDiscountPercent: string;
  effectivePrice: string;
  validFrom: string;
  validUntil: string;
  status: SducAuthorizationStatus;
  executionMode: SducExecutionMode;
  priority: number;
  baseSourceVersion: string | null;
  stopSourceVersion: string | null;
}

export interface SducRevalidationInput {
  authorization: SducPriceAuthorization;
  companyId: string;
  productId: string;
  basePrice: string | null;
  stopPrice: string | null;
  currency: string | null;
  baseSourceVersion: string | null;
  stopSourceVersion: string | null;
  mechanismEnabled: boolean;
  now: string;
}

export interface SducRevalidationResult {
  valid: boolean;
  reasonCode: SducReasonCode;
}
