import type { ProductPriceDTO, StockBalanceDTO } from "../dto";
import type { ERPMapper } from "./erp-mapper";

export interface PricingMapper<TPricePayload, TStockPayload> {
  readonly priceMapper: ERPMapper<TPricePayload, ProductPriceDTO>;
  readonly stockMapper: ERPMapper<TStockPayload, StockBalanceDTO>;
}
