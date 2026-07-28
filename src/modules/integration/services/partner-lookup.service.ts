import type {
  IntegrationPageResultDTO,
  PartnerContractDTO,
  PartnerPriceTypeDTO,
  PartnerSearchInputDTO,
  PartnerSearchResultDTO,
} from "../dto";
import type { PartnerProvider } from "../contracts";
import { IntegrationValidationError } from "../errors";
import {
  logPipelineProgress,
  validatePartnerSearchPage,
} from "./partner-search-validation";

export interface PartnerLookupService {
  searchPartners(
    input: PartnerSearchInputDTO,
  ): Promise<IntegrationPageResultDTO<PartnerSearchResultDTO>>;
  getPartnerContracts(
    partnerReference: string,
  ): Promise<IntegrationPageResultDTO<PartnerContractDTO>>;
  getPriceType(reference: string): Promise<PartnerPriceTypeDTO | null>;
  listPriceTypes(): Promise<IntegrationPageResultDTO<PartnerPriceTypeDTO>>;
  validateApprovalBinding(input: PartnerApprovalBindingInput): Promise<void>;
}

export interface PartnerApprovalBindingInput {
  partnerReference: string;
  contractReference: string | null;
  priceTypeReference: string;
  expectedFiscalCode: string;
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

    const providerOutput = await this.partnerProvider.searchPartners({
      query,
      limit: input.limit ?? 10,
    });
    logPipelineProgress("service_input", "integration_page_result", providerOutput.items.length);
    const validatedInput = validatePartnerSearchPage(providerOutput, "service_input");
    logPipelineProgress("service_output", "integration_page_result", validatedInput.items.length);
    return validatePartnerSearchPage(validatedInput, "service_output");
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

  async validateApprovalBinding(
    input: PartnerApprovalBindingInput,
  ): Promise<void> {
    const partnerReference = input.partnerReference.trim().toLowerCase();
    const partnerResult = await this.searchPartners({
      query: partnerReference,
      limit: 10,
    });
    const matches = partnerResult.items.filter(
      (partner) =>
        partner.active &&
        partner.reference.externalId.trim().toLowerCase() === partnerReference,
    );

    if (
      matches.length !== 1 ||
      (matches[0].taxId?.trim() ?? "") !== input.expectedFiscalCode.trim()
    ) {
      throw new IntegrationValidationError(
        "Selected 1C partner does not match the access request.",
      );
    }

    if (input.contractReference) {
      const contractReference = input.contractReference.trim().toLowerCase();
      const contracts = await this.getPartnerContracts(partnerReference);

      if (
        !contracts.items.some(
          (contract) =>
            contract.reference.externalId.trim().toLowerCase() ===
            contractReference,
        )
      ) {
        throw new IntegrationValidationError(
          "Selected 1C contract does not belong to the partner.",
        );
      }
    }

    const priceType = await this.getPriceType(input.priceTypeReference);

    if (
      !priceType ||
      priceType.reference.externalId.trim().toLowerCase() !==
        input.priceTypeReference.trim().toLowerCase()
    ) {
      throw new IntegrationValidationError(
        "Selected 1C price type is not available.",
      );
    }
  }
}
