import type {
  DocumentDTO,
  ProductPriceDTO,
  SalesOrderExportResultDTO,
  StockBalanceDTO,
} from "../dto";

export type IntegrationEventName =
  | "CatalogImported"
  | "PricesImported"
  | "InventoryImported"
  | "OrderExported"
  | "DocumentsImported";

export type IntegrationEventBase<TName extends IntegrationEventName, TPayload> = {
  id: string;
  name: TName;
  providerCode: string;
  occurredAt: string;
  correlationId: string;
  payload: TPayload;
};

export type CatalogImported = IntegrationEventBase<
  "CatalogImported",
  {
    productCount: number;
    categoryCount: number;
    brandCount: number;
  }
>;

export type PricesImported = IntegrationEventBase<
  "PricesImported",
  {
    prices: ProductPriceDTO[];
  }
>;

export type InventoryImported = IntegrationEventBase<
  "InventoryImported",
  {
    stockBalances: StockBalanceDTO[];
  }
>;

export type OrderExported = IntegrationEventBase<
  "OrderExported",
  {
    result: SalesOrderExportResultDTO;
  }
>;

export type DocumentsImported = IntegrationEventBase<
  "DocumentsImported",
  {
    documents: DocumentDTO[];
  }
>;

export type IntegrationDomainEvent =
  | CatalogImported
  | PricesImported
  | InventoryImported
  | OrderExported
  | DocumentsImported;
