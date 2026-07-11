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
  OneCPartnerCompanySyncPayload,
  OneCPartnerContractPayload,
  OneCPartnerPriceTypePayload,
  OneCPartnerSearchPayload,
  OneCReferencePayload,
} from "./one-c-provider.types";
import { parseOptionalOneCGuid } from "./one-c-guid";

export interface OneCPartnerMapper
  extends ERPMapper<OneCPartnerCompanySyncPayload, PartnerCompanyDTO> {}

const PROVIDER_CODE = "one-c";

export class DefaultOneCPartnerMapper implements OneCPartnerMapper {
  toPlatformDTO(payload: OneCPartnerCompanySyncPayload): PartnerCompanyDTO {
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
    const active = !payload.DeletionMark && !payload.Недействителен;
    return {
      reference: mapRawReference(payload.Ref_Key, "partner-company"),
      code: payload.Code,
      displayName: payload.Description,
      legalName: payload.НаименованиеПолное ?? null,
      fullName: payload.НаименованиеПолное ?? null,
      taxId: payload.ИНН ?? null,
      status: active ? "active" : "inactive",
      active,
      buyer: payload.Покупатель === true,
      supplier: payload.Поставщик === true,
      managerReference: null,
      metadata: {
        sourceReference: mapRawReference(payload.Ref_Key, "partner-company"),
        sourceUpdatedAt: null,
        importedAt: null,
      },
      contracts: [],
      priceTypes: [],
    };
  }

  toContractDTO(payload: OneCPartnerContractPayload, index = 0): PartnerContractDTO {
    const counterpartyPriceType = parseOptionalOneCGuid(payload.ВидЦенКонтрагента_Key);
    const contractPriceType = parseOptionalOneCGuid(payload.ВидЦен_Key);
    const organizationReference = parseOptionalOneCGuid(payload.Организация_Key);
    const priceTypeReference = counterpartyPriceType ?? contractPriceType;
    return {
      reference: mapRawReference(payload.Ref_Key, "partner-contract"),
      code: payload.Code,
      name: payload.Description,
      number: payload.НомерДоговора ?? null,
      date: payload.ДатаДоговора ?? null,
      contractType: payload.ВидДоговора ?? null,
      organizationReference: organizationReference
        ? mapRawReference(organizationReference, "organization")
        : null,
      active: !payload.DeletionMark && !payload.Недействителен,
      isDefault: index === 0,
      priceTypeReference: priceTypeReference
        ? mapRawReference(priceTypeReference, "price-type")
        : null,
      priceTypeName: null,
      priceTypeSource: counterpartyPriceType
        ? "counterparty"
        : contractPriceType
          ? "contract"
          : null,
    };
  }

  toPriceTypeDTO(payload: OneCPartnerPriceTypePayload, index = 0): PartnerPriceTypeDTO {
    return {
      reference: mapRawReference(payload.Ref_Key, "price-type"),
      name: payload.Description,
      currency: parseOptionalOneCGuid(payload.ВалютаЦены_Key),
      includesVat: payload.ЦенаВключаетНДС ?? null,
      type: payload.ТипВидаЦен ?? null,
      active: !payload.DeletionMark && payload.ЦеныАктуальны !== false,
      isDefault: index === 0,
    };
  }

  toProviderPayload(_dto: PartnerCompanyDTO): OneCPartnerCompanySyncPayload {
    throw new Error("Partner writes to 1C are outside partner search scope.");
  }
}

function mapReference(payload: OneCReferencePayload): ExternalReferenceDTO {
  return {
    providerCode: PROVIDER_CODE,
    externalId: payload.ref,
    externalType: payload.type,
  };
}

function mapRawReference(
  externalId: string,
  externalType: string,
): ExternalReferenceDTO {
  return {
    providerCode: PROVIDER_CODE,
    externalId,
    externalType,
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
