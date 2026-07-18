import type {
  CommercialRate,
  CommercialRateSnapshot,
  PublishCommercialRateInput,
  ProductPrice,
  ProductStockBalance,
} from "../types";

export type ListProductPricesInput = {
  productIds: string[];
  companyId: string;
  external1cPriceTypeId?: string;
};
export type ProductStockTotal = { productId:string; physicalQuantity:number; reservedQuantity:number; availableQuantity:number; incomingQuantity:number; hasVariantStock:boolean; syncedAt:string };
export type ProductSupplierArrival = { productId:string; externalCharacteristicRef:string; expectedDate:string; expectedQuantity:number; publishedAt:string };
export type UsdMdlExchangeRate = { sourceCode: "113"; mdlPerUsdRate: number; effectiveDate: string; publishedAt: string };

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
  currencyStatus?: "resolved" | "unresolved";
  externalProductRef?: string;
  sourceVersion?: string | null;
  syncId?: string;
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
  listAvailableCurrencyCodes?(): Promise<string[]>;
  getLatestUsdMdlExchangeRate?(): Promise<UsdMdlExchangeRate | null>;
  getActiveCommercialRateSnapshot?(): Promise<CommercialRateSnapshot>;
  listCommercialRateHistory?(limit: number): Promise<CommercialRate[]>;
  canManageCommercialRates?(): Promise<boolean>;
  publishManualCommercialRate?(input: PublishCommercialRateInput): Promise<CommercialRate>;
  upsertPriceType?(input: { externalRef: string; externalCode: string; name: string; currencyCode: string | null; currencyStatus: "resolved" | "unresolved"; sourceUpdatedAt: string | null }): Promise<void>;
  listPricesForProducts(input: ListProductPricesInput): Promise<ProductPrice[]>;
  listStockForProducts(productIds: string[]): Promise<ProductStockBalance[]>;
  listStockTotalsForProducts?(productIds:string[]):Promise<ProductStockTotal[]>;
  listSupplierArrivalsForProducts?(productIds:string[]):Promise<ProductSupplierArrival[]>;
  listProductIdsWithPositiveStock?(): Promise<string[]>;
  listProductIdsWithConfirmedArrival?(): Promise<string[]>;
  findProductPrice(input: FindProductPriceInput): Promise<ProductPrice | null>;
  upsertProductPrice(
    input: UpsertProductPriceInput,
  ): Promise<PricingUpsertResult<ProductPrice>>;
  deactivateMissingProductPrices?(syncId: string): Promise<number>;
  findProductStockBalance(
    input: FindProductStockBalanceInput,
  ): Promise<ProductStockBalance | null>;
  upsertProductStockBalance(
    input: UpsertProductStockBalanceInput,
  ): Promise<PricingUpsertResult<ProductStockBalance>>;
}
