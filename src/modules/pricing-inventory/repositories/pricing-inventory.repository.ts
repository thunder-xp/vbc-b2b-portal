import type { ProductPrice, ProductStockBalance } from "../types";

export type ListProductPricesInput = {
  productIds: string[];
  companyId: string;
};

export type PricingUpsertResult<TRecord> = {
  record: TRecord;
  created: boolean;
};

export type FindProductPriceInput = {
  productId: string;
  companyId: string | null;
  external1cPriceTypeId: string | null;
  currency: string;
  validFrom: string;
};

export type UpsertProductPriceInput = FindProductPriceInput & {
  priceAmount: number;
  validTo: string | null;
  isActive: boolean;
};

export type FindProductStockBalanceInput = {
  productId: string;
  warehouseName: string;
};

export type UpsertProductStockBalanceInput = FindProductStockBalanceInput & {
  availableQuantity: number;
  reservedQuantity: number | null;
  expectedQuantity: number | null;
  expectedAt: string | null;
  updatedFrom1cAt: string | null;
  isActive: boolean;
};

export interface PricingInventoryRepository {
  listPricesForProducts(input: ListProductPricesInput): Promise<ProductPrice[]>;
  listStockForProducts(productIds: string[]): Promise<ProductStockBalance[]>;
  findProductPrice(input: FindProductPriceInput): Promise<ProductPrice | null>;
  upsertProductPrice(
    input: UpsertProductPriceInput,
  ): Promise<PricingUpsertResult<ProductPrice>>;
  findProductStockBalance(
    input: FindProductStockBalanceInput,
  ): Promise<ProductStockBalance | null>;
  upsertProductStockBalance(
    input: UpsertProductStockBalanceInput,
  ): Promise<PricingUpsertResult<ProductStockBalance>>;
}
