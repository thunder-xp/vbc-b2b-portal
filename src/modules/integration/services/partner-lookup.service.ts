import type {
  IntegrationPageResultDTO,
  PartnerSearchInputDTO,
  PartnerSearchResultDTO,
} from "../dto";
import type { PartnerProvider } from "../contracts";
import { IntegrationValidationError } from "../errors";

export interface PartnerLookupService {
  searchPartners(
    input: PartnerSearchInputDTO,
  ): Promise<IntegrationPageResultDTO<PartnerSearchResultDTO>>;
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
}
