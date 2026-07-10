import type {
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  PartnerCompanyDTO,
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
}
