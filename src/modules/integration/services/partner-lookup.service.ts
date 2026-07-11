import type {
  IntegrationPageResultDTO,
  PartnerContractDTO,
  PartnerPriceTypeDTO,
  PartnerSearchInputDTO,
  PartnerSearchResultDTO,
} from "../dto";
import type { PartnerProvider } from "../contracts";
import { IntegrationValidationError } from "../errors";

export interface PartnerLookupService {
  searchPartners(
    input: PartnerSearchInputDTO,
  ): Promise<IntegrationPageResultDTO<PartnerSearchResultDTO>>;
  getPartnerContracts(
    partnerReference: string,
  ): Promise<IntegrationPageResultDTO<PartnerContractDTO>>;
  getPriceType(reference: string): Promise<PartnerPriceTypeDTO | null>;
  listPriceTypes(): Promise<IntegrationPageResultDTO<PartnerPriceTypeDTO>>;
}

export class DefaultPartnerLookupService implements PartnerLookupService {
  constructor(private readonly partnerProvider: PartnerProvider) {}

  async searchPartners(
    input: PartnerSearchInputDTO,
  ): Promise<IntegrationPageResultDTO<PartnerSearchResultDTO>> {
    const query = input.query.trim();

    if (query.length < 2) {
      throw new IntegrationValidationError(
        "Partner search query must contain at least 2 characters.",
      );
    }

    return this.partnerProvider.searchPartners({
      query,
      limit: input.limit ?? 10,
    });
  }

  async getPartnerContracts(
    partnerReference: string,
  ): Promise<IntegrationPageResultDTO<PartnerContractDTO>> {
    const reference = partnerReference.trim();
    if (!reference) {
      throw new IntegrationValidationError("Partner reference is required.");
    }
    return this.partnerProvider.fetchPartnerContracts({ partnerReference: reference });
  }

  async getPriceType(reference: string): Promise<PartnerPriceTypeDTO | null> {
    const normalizedReference = reference.trim();
    if (!normalizedReference) {
      throw new IntegrationValidationError("Price type reference is required.");
    }
    return this.partnerProvider.fetchPriceType({ reference: normalizedReference });
  }

  async listPriceTypes(): Promise<IntegrationPageResultDTO<PartnerPriceTypeDTO>> {
    return this.partnerProvider.listPriceTypes();
  }
}
