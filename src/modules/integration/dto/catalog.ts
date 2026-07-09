import type { ExternalReferenceDTO, IntegrationMetadataDTO } from "./common";

export type CatalogCategoryDTO = {
  reference: ExternalReferenceDTO;
  parentReference: ExternalReferenceDTO | null;
  name: string;
  slug: string | null;
  description: string | null;
  isActive: boolean;
  metadata: IntegrationMetadataDTO;
};

export type CatalogBrandDTO = {
  reference: ExternalReferenceDTO;
  name: string;
  slug: string | null;
  description: string | null;
  logoUrl: string | null;
  isActive: boolean;
  metadata: IntegrationMetadataDTO;
};

export type CatalogProductDTO = {
  reference: ExternalReferenceDTO;
  categoryReference: ExternalReferenceDTO | null;
  brandReference: ExternalReferenceDTO | null;
  sku: string;
  name: string;
  slug: string | null;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  isVisible: boolean;
  metadata: IntegrationMetadataDTO;
};
