import Decimal from "decimal.js";

import { isStale } from "../../integration/freshness";
import type { ProductCommercialViewDto } from "./pricing-inventory.service";

export type CommercialProductState = "available" | "price_changed" | "missing_price" | "temporarily_unavailable" | "inactive" | "requires_review";

export function classifyCommercialProductState(input: {
  productExists: boolean;
  productActive?: boolean;
  productVisible?: boolean;
  commercial?: ProductCommercialViewDto;
  sourceUnitPrice?: number | null;
  sourceCurrencyCode?: string | null;
}): CommercialProductState {
  if (!input.productExists || input.productActive === false || input.productVisible === false) return "inactive";
  if (!input.commercial || input.commercial.isDemoData) return "requires_review";
  if (!input.commercial.partnerPrice) return "missing_price";
  if (isStale(input.commercial.partnerPrice.lastUpdatedAt, "price")) return "requires_review";
  if (hasPriceChanged(input)) return "price_changed";
  if ((input.commercial.stock?.exactAvailableQuantity ?? 0) <= 0) return "temporarily_unavailable";
  return "available";
}

function hasPriceChanged(input: {
  commercial?: ProductCommercialViewDto;
  sourceUnitPrice?: number | null;
  sourceCurrencyCode?: string | null;
}): boolean {
  const sourcePrice = input.sourceUnitPrice;
  const currentPrice = input.commercial?.partnerPrice;
  if (sourcePrice === null || sourcePrice === undefined || !currentPrice) return false;
  const sourceCurrency = input.sourceCurrencyCode?.trim().toUpperCase() || null;
  const currentCurrency = currentPrice.currencyCode?.trim().toUpperCase() || null;
  return sourceCurrency !== currentCurrency || !new Decimal(sourcePrice).eq(currentPrice.amount);
}

export const commercialProductStateLabels: Record<CommercialProductState, string> = {
  available: "Доступно",
  price_changed: "Цена изменилась",
  missing_price: "Нет текущей цены",
  temporarily_unavailable: "Временно нет в наличии",
  inactive: "Товар недоступен",
  requires_review: "Требуется проверка",
};
