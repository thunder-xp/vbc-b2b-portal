import type { getCatalogCopy } from "../../partner-locale";

/** Localized presentation only; status and quantity are governed server projections. */
export function estimateStockLabel(stock: { stockStatus?: string | null; availableQuantity?: number | null }, copy: ReturnType<typeof getCatalogCopy>): string {
  if (stock.stockStatus === "in_stock") return stock.availableQuantity == null ? copy.inStock : `${copy.inStock}: ${stock.availableQuantity}`;
  if (stock.stockStatus === "low_stock") return stock.availableQuantity == null ? copy.lowStock : `${copy.lowStock}: ${stock.availableQuantity}`;
  if (stock.stockStatus === "expected") return copy.expected;
  if (stock.stockStatus === "out_of_stock") return copy.outOfStock;
  return `${copy.availabilityPending}: 0`;
}
