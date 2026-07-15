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
