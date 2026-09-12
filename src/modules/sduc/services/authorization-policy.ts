import Decimal from "decimal.js";

import type {
  SducPriceAuthorization,
  SducRevalidationInput,
  SducRevalidationResult,
} from "../types";

export function selectDecreaseAuthorization(
  authorizations: readonly SducPriceAuthorization[],
  now: string,
): SducPriceAuthorization | null {
  const timestamp = Date.parse(now);
  return (
    authorizations
      .filter(
        (item) =>
          item.direction === "DECREASE" &&
          item.executionMode === "DRY_RUN" &&
          item.status === "ACTIVE" &&
          Date.parse(item.validFrom) <= timestamp &&
          Date.parse(item.validUntil) > timestamp,
      )
      .sort((left, right) => {
        const byPrice = new Decimal(left.effectivePrice).comparedTo(
          new Decimal(right.effectivePrice),
        );
        if (byPrice !== 0) return byPrice;
        if (left.priority !== right.priority) return right.priority - left.priority;
        return left.id.localeCompare(right.id);
      })[0] ?? null
  );
}

export function revalidateDecreaseAuthorization(
  input: SducRevalidationInput,
): SducRevalidationResult {
  const invalid = (reasonCode: SducRevalidationResult["reasonCode"]) => ({
    valid: false,
    reasonCode,
  });
  const authorization = input.authorization;
  if (authorization.status !== "ACTIVE") {
    return invalid("AUTHORIZATION_NOT_ACTIVE");
  }
  if (Date.parse(authorization.validUntil) <= Date.parse(input.now)) {
    return invalid("AUTHORIZATION_EXPIRED");
  }
  if (
    authorization.companyId !== input.companyId ||
    authorization.productId !== input.productId
  ) {
    return invalid("AUTHORIZATION_SCOPE_MISMATCH");
  }
  if (!input.mechanismEnabled) return invalid("MECHANISM_DISABLED");
  if (input.basePrice === null || !sameDecimal(input.basePrice, authorization.basePrice)) {
    return invalid("BASE_PRICE_CHANGED");
  }
  if (input.stopPrice === null) return invalid("NO_STOP_PRICE");
  if (!sameCurrency(input.currency, authorization.currency)) {
    return invalid("CURRENCY_NOT_COMPARABLE");
  }
  if (new Decimal(input.stopPrice).gt(authorization.effectivePrice)) {
    return invalid("STOP_FLOOR_MOVED");
  }
  if (
    input.baseSourceVersion !== authorization.baseSourceVersion ||
    input.stopSourceVersion !== authorization.stopSourceVersion
  ) {
    return invalid("SOURCE_VERSION_MOVED");
  }
  return { valid: true, reasonCode: "ELIGIBLE" };
}

function sameDecimal(left: string, right: string): boolean {
  try {
    return new Decimal(left).eq(right);
  } catch {
    return false;
  }
}

function sameCurrency(left: string | null, right: string): boolean {
  return left?.trim().toUpperCase() === right.trim().toUpperCase();
}
