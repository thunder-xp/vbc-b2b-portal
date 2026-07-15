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
  characteristicReference: ExternalReferenceDTO;
  unitReference: ExternalReferenceDTO;
  vatRateReference: ExternalReferenceDTO;
  lineTotal: number;
};

export type SalesOrderDTO = {
  reference: ExternalReferenceDTO | null;
  partnerCompanyReference: ExternalReferenceDTO;
  contractReference: ExternalReferenceDTO;
  authorReference: ExternalReferenceDTO;
  organizationReference: ExternalReferenceDTO;
  priceTypeReference: ExternalReferenceDTO;
  currencyReference: ExternalReferenceDTO;
  orderStateReference: ExternalReferenceDTO;
  salesStructuralUnitReference: ExternalReferenceDTO;
  reservationStructuralUnitReference: ExternalReferenceDTO;
  portalOrderReference: string;
  status: string;
  currency: string | null;
  requestedDeliveryDate: string;
  documentTotal: number;
  items: SalesOrderItemDTO[];
  comment: string | null;
  metadata: IntegrationMetadataDTO | null;
};

export type SalesOrderExportResultDTO = {
  orderReference: ExternalReferenceDTO;
  orderNumber: string;
  documentDate: string;
  status: string;
  exportedAt: string;
  requestedDeliveryDate: string;
  documentTotal: number;
  itemCount: number;
  totalUnits: number;
};

export type SalesOrderHistoryStateCode =
  | "open"
  | "preorder"
  | "test"
  | "completed";

export type SalesOrderHistoryItemDTO = {
  lineNumber: number;
  productReference: ExternalReferenceDTO;
  characteristicReference: ExternalReferenceDTO | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type SalesOrderHistoryDTO = {
  reference: ExternalReferenceDTO;
  partnerCompanyReference: ExternalReferenceDTO;
  contractReference: ExternalReferenceDTO | null;
  currencyReference: ExternalReferenceDTO | null;
  currencyCode: string | null;
  number: string;
  documentDate: string;
  requestedDeliveryDate: string | null;
  posted: boolean;
  deletionMark: boolean;
  stateRaw: string | null;
  stateCode: SalesOrderHistoryStateCode | null;
  documentTotal: number;
  sourceVersion: string | null;
  items: SalesOrderHistoryItemDTO[];
};
