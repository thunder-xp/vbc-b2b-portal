import type { RetailPriceHistoryDto } from "../../pricing-inventory";
import type { CatalogProductDetailDto } from "../services";

export type TransportedProductTab = "description" | "characteristics" | "datasheet" | "pricing";

export type ProductTabTransportDto =
  | { tab: "description" | "characteristics" | "datasheet"; product: CatalogProductDetailDto }
  | { tab: "pricing"; history: RetailPriceHistoryDto | null; error: string | null };

export type ProductTabTransportResponse = {
  data: ProductTabTransportDto;
  serverDurationMs: number;
};

export function isTransportedProductTab(value: string | null): value is TransportedProductTab {
  return value === "description" || value === "characteristics" || value === "datasheet" || value === "pricing";
}
