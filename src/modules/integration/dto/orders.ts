import type {
  ExternalReferenceDTO,
  IntegrationMetadataDTO,
  MoneyAmountDTO,
} from "./common";

export type SalesOrderItemDTO = {
  productReference: ExternalReferenceDTO;
  sku: string;
  name: string;
  quantity: number;
  unitCode: string | null;
  price: MoneyAmountDTO | null;
};

export type SalesOrderDTO = {
  reference: ExternalReferenceDTO | null;
  partnerCompanyReference: ExternalReferenceDTO;
  portalOrderReference: string;
  status: string;
  currency: string | null;
  items: SalesOrderItemDTO[];
  comment: string | null;
  metadata: IntegrationMetadataDTO | null;
};

export type SalesOrderExportResultDTO = {
  orderReference: ExternalReferenceDTO;
  status: string;
  exportedAt: string;
};
