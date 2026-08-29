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
  historySyncContext?: {
    syncId: string;
    page: number;
  };
  historyReadMode?: "full" | "incremental_headers" | "integrity_headers";
  historyDateFrom?: string;
};

export type SalesOrderHistoryPageResult = IntegrationPageResultDTO<SalesOrderHistoryDTO> & {
  rawRowCount: number;
  mappedRowCount: number;
  rejectedRowCount: number;
  lineRowCount: number;
  lineWarningCount: number;
  lineReadFailedReferences: string[];
  duplicateRowCount: number;
  enrichmentWarningCount: number;
  requestCount?: number;
  requestDurationMs?: number;
};

export type SalesOrderHistoryExistenceStatus = "exists" | "deletion_marked" | "absent" | "unknown";

export type SalesOrderHistoryExistenceResult = {
  results: Array<{
    reference: ExternalReferenceDTO;
    status: SalesOrderHistoryExistenceStatus;
    header: SalesOrderHistoryDTO | null;
  }>;
  requestCount: number;
  requestDurationMs: number;
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
  fetchSalesOrderHistoryByReferences?(
    input: SalesOrderStatusFetchRequestDTO & { orderReferences: ExternalReferenceDTO[] },
  ): Promise<SalesOrderHistoryPageResult>;
  verifySalesOrderHistoryReferences?(
    input: SalesOrderStatusFetchRequestDTO & { orderReferences: ExternalReferenceDTO[] },
  ): Promise<SalesOrderHistoryExistenceResult>;
}
