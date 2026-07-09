import type { ERPProvider } from "../contracts";
import type {
  CatalogBrandDTO,
  CatalogCategoryDTO,
  CatalogProductDTO,
  DocumentDTO,
  FinanceSnapshotDTO,
  InvoiceDTO,
  PartnerCompanyDTO,
  ProductPriceDTO,
  SalesOrderDTO,
  SalesOrderExportResultDTO,
  StockBalanceDTO,
} from "../dto";
import type { IntegrationDomainEvent } from "../events";

export type IntegrationImportResult<TItem> = {
  items: TItem[];
  events: IntegrationDomainEvent[];
  warnings: string[];
};

export interface IntegrationCoordinator {
  getProvider(providerCode: string): ERPProvider | null;
  importCatalog(providerCode: string): Promise<
    IntegrationImportResult<
      CatalogProductDTO | CatalogCategoryDTO | CatalogBrandDTO
    >
  >;
  importPrices(
    providerCode: string,
  ): Promise<IntegrationImportResult<ProductPriceDTO>>;
  importInventory(
    providerCode: string,
  ): Promise<IntegrationImportResult<StockBalanceDTO>>;
  importDocuments(
    providerCode: string,
  ): Promise<IntegrationImportResult<DocumentDTO>>;
  importFinance(
    providerCode: string,
  ): Promise<IntegrationImportResult<FinanceSnapshotDTO | InvoiceDTO>>;
  importPartners(
    providerCode: string,
  ): Promise<IntegrationImportResult<PartnerCompanyDTO>>;
  exportOrder(
    providerCode: string,
    order: SalesOrderDTO,
  ): Promise<SalesOrderExportResultDTO>;
}
