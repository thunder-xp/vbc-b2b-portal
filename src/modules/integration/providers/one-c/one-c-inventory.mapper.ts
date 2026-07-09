import type { ERPMapper } from "../../mapping";
import type {
  ExternalReferenceDTO,
  IntegrationMetadataDTO,
  StockBalanceDTO,
} from "../../dto";
import type { OneCStockBalancePayload } from "./one-c-provider.types";

export interface OneCInventoryMapper
  extends ERPMapper<OneCStockBalancePayload, StockBalanceDTO> {}

const PROVIDER_CODE = "one-c";

export class DefaultOneCInventoryMapper implements OneCInventoryMapper {
  toPlatformDTO(payload: OneCStockBalancePayload): StockBalanceDTO {
    return {
      reference: toReference(payload.reference),
      productReference: toReference(payload.productReference),
      warehouseReference: payload.warehouseReference
        ? toReference(payload.warehouseReference)
        : null,
      warehouseName: payload.warehouseName,
      availableQuantity: payload.availableQuantity,
      reservedQuantity: payload.reservedQuantity,
      expectedQuantity: payload.expectedQuantity,
      expectedAt: payload.expectedAt,
      sourceUpdatedAt: payload.sourceUpdatedAt,
      isActive: payload.active,
      metadata: toMetadata(payload.reference, payload.metadata.sourceUpdatedAt),
    };
  }

  toProviderPayload(dto: StockBalanceDTO): OneCStockBalancePayload {
    return {
      reference: toOneCReference(dto.reference),
      productReference: toOneCReference(dto.productReference),
      warehouseReference: dto.warehouseReference
        ? toOneCReference(dto.warehouseReference)
        : null,
      warehouseName: dto.warehouseName,
      availableQuantity: dto.availableQuantity,
      reservedQuantity: dto.reservedQuantity,
      expectedQuantity: dto.expectedQuantity,
      expectedAt: dto.expectedAt,
      sourceUpdatedAt: dto.sourceUpdatedAt,
      active: dto.isActive,
      metadata: {
        sourceUpdatedAt: dto.metadata.sourceUpdatedAt,
      },
    };
  }
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
