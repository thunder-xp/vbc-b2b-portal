import type { PricingMapper } from "../../mapping";
import type {
  OneCProductPricePayload,
  OneCStockBalancePayload,
} from "./one-c-provider.types";

export interface OneCPricingMapper
  extends PricingMapper<OneCProductPricePayload, OneCStockBalancePayload> {}
