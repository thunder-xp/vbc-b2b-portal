import type {
  ExternalReferenceDTO,
  IntegrationMetadataDTO,
  MoneyAmountDTO,
} from "./common";

export type ProductPriceDTO = {
  reference: ExternalReferenceDTO;
  productReference: ExternalReferenceDTO;
  partnerCompanyReference: ExternalReferenceDTO | null;
  priceTypeReference: ExternalReferenceDTO | null;
  money: MoneyAmountDTO;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  priceTypeCode?: string;
  priceTypeName?: string;
  currencyStatus?: "resolved" | "unresolved";
  metadata: IntegrationMetadataDTO;
};
