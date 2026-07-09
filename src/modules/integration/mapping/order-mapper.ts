import type { SalesOrderDTO, SalesOrderExportResultDTO } from "../dto";
import type { ERPMapper } from "./erp-mapper";

export interface OrderMapper<TOrderPayload, TOrderExportResultPayload> {
  readonly orderMapper: ERPMapper<TOrderPayload, SalesOrderDTO>;
  readonly orderExportResultMapper: ERPMapper<
    TOrderExportResultPayload,
    SalesOrderExportResultDTO
  >;
}
