import Decimal from "decimal.js";

import type {
  SducDecreaseEnvelope,
  SducDecreaseEnvelopeInput,
  SducReasonCode,
} from "../types";

const MONEY_SCALE = 6;

export function evaluateDecreaseEnvelope(
  input: SducDecreaseEnvelopeInput,
): SducDecreaseEnvelope {
  const rejected = (reasonCode: SducReasonCode): SducDecreaseEnvelope => ({
    eligible: false,
    reasonCode,
    basePrice: input.basePrice,
    stopPrice: input.stopPrice,
    currency: normalizeCurrency(input.baseCurrency),
    reserveAbsolute: null,
    reservePercent: null,
    allowedDiscountPercent: null,
    approvedDiscountPercent: null,
    effectivePrice: null,
    executionMode: input.policy.executionMode,
    constraintsApplied: [],
  });

  if (input.policy.direction !== "DECREASE") {
    return rejected("DIRECTION_NOT_IMPLEMENTED");
  }
  if (input.policy.executionMode !== "DRY_RUN") {
    return rejected("SYSTEM_NOT_ACTIVE");
  }
  if (!input.policy.enabled) return rejected("MECHANISM_DISABLED");
  if (input.basePrice === null) return rejected("NO_BASE_PRICE");
  if (!isPositiveDecimal(input.basePrice)) return rejected("INVALID_BASE_PRICE");
  if (input.stopPrice === null) return rejected("NO_STOP_PRICE");
  if (!isPositiveDecimal(input.stopPrice)) return rejected("INVALID_STOP_PRICE");

  const baseCurrency = normalizeCurrency(input.baseCurrency);
  const stopCurrency = normalizeCurrency(input.stopCurrency);
  if (!baseCurrency || !stopCurrency || baseCurrency !== stopCurrency) {
    return rejected("CURRENCY_NOT_COMPARABLE");
  }

  const base = new Decimal(input.basePrice);
  const stop = new Decimal(input.stopPrice);
  if (base.lte(stop)) return rejected("NO_DOWNWARD_PRICE_RESERVE");
  if (!isPositiveDecimal(input.requestedDiscountPercent)) {
    return rejected("INVALID_REQUESTED_DISCOUNT");
  }
  if (
    input.policy.globalCeilingPercent === null ||
    !isPositiveDecimal(input.policy.globalCeilingPercent) ||
    input.policy.mechanismMaximumPercent === null ||
    !isPositiveDecimal(input.policy.mechanismMaximumPercent)
  ) {
    return rejected("SYSTEM_NOT_ACTIVE");
  }

  const reserveAbsolute = base.minus(stop);
  const reservePercent = reserveAbsolute.div(base).mul(100);
  const allowed = Decimal.min(
    reservePercent,
    new Decimal(input.policy.globalCeilingPercent),
    new Decimal(input.policy.mechanismMaximumPercent),
  );
  const requested = new Decimal(input.requestedDiscountPercent);
  const globalCeiling = new Decimal(input.policy.globalCeilingPercent);
  const mechanismMaximum = new Decimal(input.policy.mechanismMaximumPercent);
  const constraintsApplied: SducReasonCode[] = [];
  if (globalCeiling.lte(reservePercent) && globalCeiling.lte(mechanismMaximum)) {
    constraintsApplied.push("GLOBAL_AUTOMATION_LIMIT");
  }
  if (mechanismMaximum.lte(reservePercent) && mechanismMaximum.lte(globalCeiling)) {
    constraintsApplied.push("MECHANISM_LIMIT");
  }
  if (requested.gt(allowed)) constraintsApplied.push("REQUEST_ABOVE_ALLOWED");
  const approved = input.policy.discountStepsPercent
    .filter(isPositiveDecimal)
    .map((step) => new Decimal(step))
    .filter((step) => step.lte(allowed) && step.lte(requested))
    .sort((left, right) => right.comparedTo(left))[0];

  if (!approved) {
    return {
      ...rejected("NO_ALLOWED_DISCOUNT_STEP"),
      reserveAbsolute: decimalString(reserveAbsolute),
      reservePercent: decimalString(reservePercent),
      allowedDiscountPercent: decimalString(allowed),
      constraintsApplied,
    };
  }

  const effectivePrice = Decimal.max(
    stop,
    base.mul(new Decimal(100).minus(approved)).div(100),
  ).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_CEIL);

  return {
    eligible: true,
    reasonCode: "ELIGIBLE",
    basePrice: decimalString(base),
    stopPrice: decimalString(stop),
    currency: baseCurrency,
    reserveAbsolute: decimalString(reserveAbsolute),
    reservePercent: decimalString(reservePercent),
    allowedDiscountPercent: decimalString(allowed),
    approvedDiscountPercent: decimalString(approved),
    effectivePrice: effectivePrice.toFixed(MONEY_SCALE),
    executionMode: "DRY_RUN",
    constraintsApplied,
  };
}

function isPositiveDecimal(value: string): boolean {
  try {
    return new Decimal(value).isFinite() && new Decimal(value).gt(0);
  } catch {
    return false;
  }
}

function normalizeCurrency(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function decimalString(value: Decimal): string {
  return value.toDecimalPlaces(12).toFixed();
}
