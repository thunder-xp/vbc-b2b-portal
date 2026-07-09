import type { ProductPrice, ProductStockBalance } from "../types";

export type ListProductPricesInput = {
  productIds: string[];
  companyId: string;
};

export interface PricingInventoryRepository {
  listPricesForProducts(input: ListProductPricesInput): Promise<ProductPrice[]>;
  listStockForProducts(productIds: string[]): Promise<ProductStockBalance[]>;
}
