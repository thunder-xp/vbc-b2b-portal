import type {
  ExternalReferenceDTO,
  IntegrationMetadataDTO,
  PartnerCompanyDTO,
  PartnerContractDTO,
  PartnerPriceTypeDTO,
  PartnerSearchResultDTO,
} from "../../dto";
import type { ERPMapper } from "../../mapping";
import type {
  OneCMetadataPayload,
  OneCPartnerCompanyPayload,
  OneCPartnerContractPayload,
  OneCPartnerPriceTypePayload,
  OneCPartnerSearchPayload,
  OneCReferencePayload,
} from "./one-c-provider.types";

export interface OneCPartnerMapper
  extends ERPMapper<OneCPartnerCompanyPayload, PartnerCompanyDTO> {}

const PROVIDER_CODE = "one-c";

export class DefaultOneCPartnerMapper implements OneCPartnerMapper {
  toPlatformDTO(payload: OneCPartnerCompanyPayload): PartnerCompanyDTO {
    return {
      reference: mapReference(payload.reference),
      displayName: payload.displayName,
      legalName: payload.legalName,
      taxId: payload.taxId,
      status: payload.status,
      managerReference: payload.managerReference
        ? mapReference(payload.managerReference)
        : null,
      metadata: mapMetadata(payload.reference, payload.metadata),
    };
  }

  toSearchResultDTO(payload: OneCPartnerSearchPayload): PartnerSearchResultDTO {
    return {
      ...this.toPlatformDTO(payload),
      contracts: payload.contracts.map(mapContract),
      priceTypes: payload.priceTypes.map(mapPriceType),
    };
  }

  toProviderPayload(_dto: PartnerCompanyDTO): OneCPartnerCompanyPayload {
    throw new Error("Partner writes to 1C are outside partner search scope.");
  }
}

function mapContract(payload: OneCPartnerContractPayload): PartnerContractDTO {
  return {
    reference: mapReference(payload.reference),
    name: payload.name,
    active: payload.active,
    isDefault: payload.default,
  };
}

function mapPriceType(payload: OneCPartnerPriceTypePayload): PartnerPriceTypeDTO {
  return {
    reference: mapReference(payload.reference),
    name: payload.name,
    currency: payload.currency,
    active: payload.active,
    isDefault: payload.default,
  };
}

function mapReference(payload: OneCReferencePayload): ExternalReferenceDTO {
  return {
    providerCode: PROVIDER_CODE,
    externalId: payload.ref,
    externalType: payload.type,
  };
}

function mapMetadata(
  sourceReference: OneCReferencePayload,
  metadata: OneCMetadataPayload,
): IntegrationMetadataDTO {
  return {
    sourceReference: mapReference(sourceReference),
    sourceUpdatedAt: metadata.sourceUpdatedAt,
    importedAt: null,
  };
}
