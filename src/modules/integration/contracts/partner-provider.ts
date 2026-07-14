import type {
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  PartnerCompanyDTO,
  PartnerContractDTO,
  PartnerContractLookupInputDTO,
  PartnerCustomerContractResolutionInputDTO,
  PartnerPriceTypeDTO,
  PartnerPriceTypeLookupInputDTO,
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
  fetchPartnerContracts(
    input: PartnerContractLookupInputDTO,
  ): Promise<IntegrationPageResultDTO<PartnerContractDTO>>;
  resolveCustomerOrderContract(
    input: PartnerCustomerContractResolutionInputDTO,
  ): Promise<PartnerContractDTO | null>;
  fetchPriceType(
    input: PartnerPriceTypeLookupInputDTO,
  ): Promise<PartnerPriceTypeDTO | null>;
  listPriceTypes(): Promise<IntegrationPageResultDTO<PartnerPriceTypeDTO>>;
}
