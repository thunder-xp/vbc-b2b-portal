import type {
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  PartnerCompanyDTO,
  PartnerCommercialProfileLookupInputDTO,
  PartnerCommercialProfileSourceDTO,
  PartnerContractDTO,
  PartnerContractLookupInputDTO,
  PartnerCustomerContractResolutionInputDTO,
  PartnerPriceTypeDTO,
  PartnerPriceTypeLookupInputDTO,
  PartnerReferenceLookupInputDTO,
  PartnerSearchInputDTO,
  PartnerSearchResultDTO,
} from "../dto";

export interface PartnerProvider {
  fetchPartnerCompanies(
    input: IntegrationSyncWindowDTO,
  ): Promise<IntegrationPageResultDTO<PartnerCompanyDTO>>;
  searchPartners(
    input: PartnerSearchInputDTO,
  ): Promise<IntegrationPageResultDTO<PartnerSearchResultDTO>>;
  fetchPartnerByReference(
    input: PartnerReferenceLookupInputDTO,
  ): Promise<PartnerSearchResultDTO | null>;
  fetchPartnerContracts(
    input: PartnerContractLookupInputDTO,
  ): Promise<IntegrationPageResultDTO<PartnerContractDTO>>;
  fetchCommercialProfile(
    input: PartnerCommercialProfileLookupInputDTO,
  ): Promise<PartnerCommercialProfileSourceDTO>;
  resolveCustomerOrderContract(
    input: PartnerCustomerContractResolutionInputDTO,
  ): Promise<PartnerContractDTO | null>;
  fetchPriceType(
    input: PartnerPriceTypeLookupInputDTO,
  ): Promise<PartnerPriceTypeDTO | null>;
  listPriceTypes(): Promise<IntegrationPageResultDTO<PartnerPriceTypeDTO>>;
}
