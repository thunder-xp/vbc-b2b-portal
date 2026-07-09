import type { PricingMapper } from "../../mapping";
import type {
  ExternalReferenceDTO,
  IntegrationMetadataDTO,
  ProductPriceDTO,
  StockBalanceDTO,
} from "../../dto";
import type {
  OneCProductPricePayload,
  OneCStockBalancePayload,
} from "./one-c-provider.types";

export interface OneCPricingMapper
  extends PricingMapper<OneCProductPricePayload, OneCStockBalancePayload> {}

const PROVIDER_CODE = "one-c";

export class DefaultOneCPricingMapper implements OneCPricingMapper {
  readonly priceMapper = {
    toPlatformDTO: (payload: OneCProductPricePayload): ProductPriceDTO => ({
      reference: toReference(payload.reference),
      productReference: toReference(payload.productReference),
      partnerCompanyReference: payload.partnerCompanyReference
        ? toReference(payload.partnerCompanyReference)
        : null,
      priceTypeReference: payload.priceTypeReference
        ? toReference(payload.priceTypeReference)
        : null,
      money: {
        currency: payload.currency,
        amount: payload.amount,
      },
      validFrom: payload.validFrom,
      validTo: payload.validTo,
      isActive: payload.active,
      metadata: toMetadata(payload.reference, payload.metadata.sourceUpdatedAt),
    }),
    toProviderPayload: (dto: ProductPriceDTO): OneCProductPricePayload => ({
      reference: toOneCReference(dto.reference),
      productReference: toOneCReference(dto.productReference),
      partnerCompanyReference: dto.partnerCompanyReference
        ? toOneCReference(dto.partnerCompanyReference)
        : null,
      priceTypeReference: dto.priceTypeReference
        ? toOneCReference(dto.priceTypeReference)
        : null,
      currency: dto.money.currency,
      amount: dto.money.amount,
      validFrom: dto.validFrom,
      validTo: dto.validTo,
      active: dto.isActive,
      metadata: {
        sourceUpdatedAt: dto.metadata.sourceUpdatedAt,
      },
    }),
  };

  readonly stockMapper = {
    toPlatformDTO: (_payload: OneCStockBalancePayload): StockBalanceDTO => {
      throw new Error("1C stock mapping is outside the pricing sync scope.");
    },
    toProviderPayload: (_dto: StockBalanceDTO): OneCStockBalancePayload => {
      throw new Error("1C stock mapping is outside the pricing sync scope.");
    },
  };
}

function toReference(reference: {
  ref: string;
  type: string;
}): ExternalReferenceDTO {
  return {
    providerCode: PROVIDER_CODE,
    externalId: reference.ref,
    externalType: reference.type,
  };
}

function toOneCReference(reference: ExternalReferenceDTO) {
  return {
    ref: reference.externalId,
    type: reference.externalType,
  };
}

function toMetadata(
  reference: { ref: string; type: string },
  sourceUpdatedAt: string | null,
): IntegrationMetadataDTO {
  return {
    sourceReference: toReference(reference),
    sourceUpdatedAt,
    importedAt: null,
  };
}
