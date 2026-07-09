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
  metadata: IntegrationMetadataDTO;
};
