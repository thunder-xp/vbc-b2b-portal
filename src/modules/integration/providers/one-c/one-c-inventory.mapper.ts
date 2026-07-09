import type { ERPMapper } from "../../mapping";
import type { StockBalanceDTO } from "../../dto";
import type { OneCStockBalancePayload } from "./one-c-provider.types";

export interface OneCInventoryMapper
  extends ERPMapper<OneCStockBalancePayload, StockBalanceDTO> {}
