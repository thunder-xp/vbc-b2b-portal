import type {
  ExternalReferenceDTO,
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  ProductPriceDTO,
} from "../dto";

export type ProductPriceFetchRequestDTO = IntegrationSyncWindowDTO & {
  productReferences?: ExternalReferenceDTO[];
  partnerCompanyReference?: ExternalReferenceDTO | null;
};

export type CurrentProductPriceFetchRequestDTO = {
  productReferences: ExternalReferenceDTO[];
  priceTypeReference: ExternalReferenceDTO;
};

export type CurrentProductPriceDTO = {
  productReference: ExternalReferenceDTO;
  priceTypeReference: ExternalReferenceDTO;
  amount: number;
  effectiveAt: string;
  isActive: boolean;
};

export interface PricingProvider {
  fetchProductPrices(
    input: ProductPriceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<ProductPriceDTO>>;
  fetchCurrentProductPrices?(
    input: CurrentProductPriceFetchRequestDTO,
  ): Promise<CurrentProductPriceDTO[]>;
}
