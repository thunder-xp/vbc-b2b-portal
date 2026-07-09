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

export interface PricingProvider {
  fetchProductPrices(
    input: ProductPriceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<ProductPriceDTO>>;
}
