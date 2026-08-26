export type CommercialCurrencyContext = {
  settlementCurrencyRef: string | null;
  settlementCurrencyCode: string | null;
  authoritativePriceCurrencyRef: string | null;
  authoritativePriceCurrencyCode: string | null;
  publishedPriceCurrencyRef: string | null;
  publishedPriceCurrencyCode: string | null;
};

export type CommercialCurrencyValidationCode =
  | "COMMERCIAL_CURRENCY_VALID"
  | "SETTLEMENT_CURRENCY_MISSING"
  | "AUTHORITATIVE_PRICE_CURRENCY_MISSING"
  | "PUBLISHED_PRICE_CURRENCY_MISSING"
  | "PRICE_CURRENCY_MISMATCH";

export type CommercialCurrencyValidation = {
  valid: boolean;
  code: CommercialCurrencyValidationCode;
};

export function validateSettlementCurrency(
  context: Pick<CommercialCurrencyContext, "settlementCurrencyRef">,
): CommercialCurrencyValidation {
  return normalized(context.settlementCurrencyRef)
    ? validResult()
    : { valid: false, code: "SETTLEMENT_CURRENCY_MISSING" };
}

export function validatePriceCurrencyAlignment(
  context: Pick<
    CommercialCurrencyContext,
    "authoritativePriceCurrencyRef" | "publishedPriceCurrencyRef"
  >,
): CommercialCurrencyValidation {
  const authoritative = normalized(context.authoritativePriceCurrencyRef);
  if (!authoritative) {
    return { valid: false, code: "AUTHORITATIVE_PRICE_CURRENCY_MISSING" };
  }
  const published = normalized(context.publishedPriceCurrencyRef);
  if (!published) {
    return { valid: false, code: "PUBLISHED_PRICE_CURRENCY_MISSING" };
  }
  return authoritative === published
    ? validResult()
    : { valid: false, code: "PRICE_CURRENCY_MISMATCH" };
}

export function validateCommercialCurrencyContext(
  context: CommercialCurrencyContext,
): CommercialCurrencyValidation {
  const settlement = validateSettlementCurrency(context);
  if (!settlement.valid) return settlement;
  return validatePriceCurrencyAlignment(context);
}

function normalized(value: string | null): string | null {
  const result = value?.trim().toLowerCase() ?? "";
  return result || null;
}

function validResult(): CommercialCurrencyValidation {
  return { valid: true, code: "COMMERCIAL_CURRENCY_VALID" };
}
