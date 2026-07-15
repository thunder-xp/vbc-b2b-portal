import type {
  ExternalReferenceDTO,
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  SalesOrderDTO,
  SalesOrderHistoryDTO,
  SalesOrderExportResultDTO,
} from "../dto";

export type SalesOrderStatusFetchRequestDTO = IntegrationSyncWindowDTO & {
  orderReferences?: ExternalReferenceDTO[];
  partnerCompanyReference?: ExternalReferenceDTO | null;
};

export type SalesOrderHistoryPageResult = IntegrationPageResultDTO<SalesOrderHistoryDTO> & {
  rawRowCount: number;
  mappedRowCount: number;
  rejectedRowCount: number;
  lineRowCount: number;
  duplicateRowCount: number;
};

export interface OrderProvider {
  exportSalesOrder(order: SalesOrderDTO): Promise<SalesOrderExportResultDTO>;
  findExportedSalesOrders(order: SalesOrderDTO): Promise<SalesOrderExportResultDTO[]>;
  fetchSalesOrders(
    input: SalesOrderStatusFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<SalesOrderDTO>>;
  fetchSalesOrderHistory(
    input: SalesOrderStatusFetchRequestDTO,
  ): Promise<SalesOrderHistoryPageResult>;
}
