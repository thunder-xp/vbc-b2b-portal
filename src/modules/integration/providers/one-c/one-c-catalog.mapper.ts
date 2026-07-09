import type { CatalogMapper } from "../../mapping";
import type {
  CatalogBrandDTO,
  CatalogCategoryDTO,
  CatalogProductDTO,
  ExternalReferenceDTO,
  IntegrationMetadataDTO,
} from "../../dto";
import type {
  OneCCatalogBrandPayload,
  OneCCatalogCategoryPayload,
  OneCCatalogProductPayload,
} from "./one-c-provider.types";

export interface OneCCatalogMapper
  extends CatalogMapper<
    OneCCatalogProductPayload,
    OneCCatalogCategoryPayload,
    OneCCatalogBrandPayload
  > {}

const PROVIDER_CODE = "one-c";

export class DefaultOneCCatalogMapper implements OneCCatalogMapper {
  readonly productMapper = {
    toPlatformDTO: (payload: OneCCatalogProductPayload): CatalogProductDTO => ({
      reference: toReference(payload.reference),
      categoryReference: payload.categoryReference
        ? toReference(payload.categoryReference)
        : null,
      brandReference: payload.brandReference
        ? toReference(payload.brandReference)
        : null,
      sku: payload.sku,
      name: payload.name,
      slug: slugify(payload.name || payload.sku),
      shortDescription: payload.shortDescription,
      description: payload.description,
      imageUrl: payload.imageUrl,
      isActive: payload.active,
      isVisible: payload.visible,
      metadata: toMetadata(payload.reference, payload.metadata.sourceUpdatedAt),
    }),
    toProviderPayload: (dto: CatalogProductDTO): OneCCatalogProductPayload => ({
      reference: toOneCReference(dto.reference),
      categoryReference: dto.categoryReference
        ? toOneCReference(dto.categoryReference)
        : null,
      brandReference: dto.brandReference
        ? toOneCReference(dto.brandReference)
        : null,
      sku: dto.sku,
      name: dto.name,
      shortDescription: dto.shortDescription,
      description: dto.description,
      imageUrl: dto.imageUrl,
      active: dto.isActive,
      visible: dto.isVisible,
      metadata: {
        sourceUpdatedAt: dto.metadata.sourceUpdatedAt,
      },
    }),
  };

  readonly categoryMapper = {
    toPlatformDTO: (
      payload: OneCCatalogCategoryPayload,
    ): CatalogCategoryDTO => ({
      reference: toReference(payload.reference),
      parentReference: payload.parentReference
        ? toReference(payload.parentReference)
        : null,
      name: payload.name,
      slug: slugify(payload.name),
      description: payload.description,
      isActive: payload.active,
      metadata: toMetadata(payload.reference, payload.metadata.sourceUpdatedAt),
    }),
    toProviderPayload: (
      dto: CatalogCategoryDTO,
    ): OneCCatalogCategoryPayload => ({
      reference: toOneCReference(dto.reference),
      parentReference: dto.parentReference
        ? toOneCReference(dto.parentReference)
        : null,
      name: dto.name,
      description: dto.description,
      active: dto.isActive,
      metadata: {
        sourceUpdatedAt: dto.metadata.sourceUpdatedAt,
      },
    }),
  };

  readonly brandMapper = {
    toPlatformDTO: (payload: OneCCatalogBrandPayload): CatalogBrandDTO => ({
      reference: toReference(payload.reference),
      name: payload.name,
      slug: slugify(payload.name),
      description: payload.description,
      logoUrl: payload.logoUrl,
      isActive: payload.active,
      metadata: toMetadata(payload.reference, payload.metadata.sourceUpdatedAt),
    }),
    toProviderPayload: (dto: CatalogBrandDTO): OneCCatalogBrandPayload => ({
      reference: toOneCReference(dto.reference),
      name: dto.name,
      description: dto.description,
      logoUrl: dto.logoUrl,
      active: dto.isActive,
      metadata: {
        sourceUpdatedAt: dto.metadata.sourceUpdatedAt,
      },
    }),
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

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "item";
}
