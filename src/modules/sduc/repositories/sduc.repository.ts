import type {
  SducDecreasePolicy,
  SducMechanismType,
  SducPriceAuthorization,
} from "../types";

export interface SducEvaluationContext {
  companyId: string;
  productId: string;
  basePrice: string | null;
  stopPrice: string | null;
  baseCurrency: string | null;
  stopCurrency: string | null;
  baseSourceVersion: string | null;
  stopSourceVersion: string | null;
  policy: SducDecreasePolicy;
}

export interface CreateSducAuthorizationInput {
  context: SducEvaluationContext;
  mechanismInstanceId: string;
  requestedDiscountPercent: string;
  approvedDiscountPercent: string;
  reserveAbsolute: string;
  reservePercent: string;
  effectivePrice: string;
}

export interface SducRepository {
  getDecreaseEvaluationContext(input: {
    companyId: string;
    productId: string;
    mechanismType: SducMechanismType;
  }): Promise<SducEvaluationContext>;
  createDryRunAuthorization(
    input: CreateSducAuthorizationInput,
  ): Promise<SducPriceAuthorization>;
}
