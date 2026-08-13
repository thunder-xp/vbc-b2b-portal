import type {
  PublicRetailCategoryDto,
  PublicRetailCatalogMode,
  PublicRetailCalculatorProductResolutionDto,
  PublicRetailFacetDto,
  PublicRetailLocale,
  PublicRetailProductDetailDto,
  PublicRetailProductPageDto,
  PublicRetailPublicationMetrics,
  PublicRetailShowcaseDto,
} from "../types";

export type ListPublicRetailProductsInput = {
  locale: PublicRetailLocale;
  categorySlug?: string;
  search?: string;
  availability?: string;
  facets?: Record<string, string[]>;
  mode?: PublicRetailCatalogMode;
  limit: number;
  offset: number;
};

export interface PublicRetailReadRepository {
  listCategories(locale: PublicRetailLocale): Promise<PublicRetailCategoryDto[]>;
  listProducts(input: ListPublicRetailProductsInput): Promise<PublicRetailProductPageDto>;
  getShowcase(locale: PublicRetailLocale): Promise<PublicRetailShowcaseDto>;
  getProduct(slug: string, locale: PublicRetailLocale): Promise<PublicRetailProductDetailDto | null>;
  listFacets(categorySlug: string | undefined, locale: PublicRetailLocale): Promise<PublicRetailFacetDto[]>;
  resolveCalculatorProducts(profileKeys: string[], locale: PublicRetailLocale): Promise<PublicRetailCalculatorProductResolutionDto[]>;
}

export interface PublicRetailPublicationRepository {
  start(): Promise<string>;
  build(publicationId: string): Promise<PublicRetailPublicationMetrics>;
  publish(publicationId: string, checksum: string): Promise<void>;
  fail(publicationId: string, safeError: string): Promise<void>;
}
