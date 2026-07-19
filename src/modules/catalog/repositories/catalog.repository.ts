import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDocument,
  CatalogProductImage,
  CatalogProductAttribute,
} from "../types";

export type ListCatalogProductsInput = {
  categoryId?: string;
  categoryIds?: string[];
  brandId?: string;
  searchBrandIds?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  productIds?: string[];
};

export type CatalogAttributeFilters = Record<string, string[]>;
export type CatalogFacetValueRecord = { key: string; label: string; value: string; count: number; coverage: number };

export type CatalogPartnerPageInput = {
  companyId: string;
  categoryId?: string;
  brandId?: string;
  search?: string;
  availability: "all" | "in_stock" | "expected";
  attributeFilters: CatalogAttributeFilters;
  sort: "default" | "availability_asc" | "availability_desc" | "price_asc" | "price_desc" | "markup_asc" | "markup_desc";
  limit: number;
  offset: number;
};

export type CatalogPartnerPageRecord = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  brand: Pick<CatalogBrand, "id" | "name" | "slug"> | null;
  category: Pick<CatalogCategory, "id" | "parentId" | "name" | "slug"> | null;
};

export type CatalogPartnerPage = {
  items: CatalogPartnerPageRecord[];
  totalCount: number;
};

export type CatalogPartnerFacetInput = Pick<
  CatalogPartnerPageInput,
  "companyId" | "categoryId" | "brandId" | "search" | "availability" | "attributeFilters"
>;

export type CatalogProductDetailAggregate = {
  product: CatalogProduct;
  brand: CatalogBrand | null;
  category: CatalogCategory | null;
  images: CatalogProductImage[];
  documents: CatalogProductDocument[];
  attributes: CatalogProductAttribute[];
};

export type CatalogUpsertResult<TRecord> = {
  record: TRecord;
  created: boolean;
};

export type UpsertCatalogCategoryInput = {
  external1cId: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder?: number;
  isActive: boolean;
};

export type UpsertCatalogBrandInput = {
  external1cId: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  sortOrder?: number;
  isActive: boolean;
};

export type UpsertCatalogProductInput = {
  external1cId: string;
  categoryId: string | null;
  brandId: string | null;
  sku: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  sortOrder?: number;
  isActive: boolean;
  isVisible: boolean;
};

export interface CatalogRepository {
  listPartnerPage?(input: CatalogPartnerPageInput): Promise<CatalogPartnerPage>;
  listPartnerFacets?(input: CatalogPartnerFacetInput): Promise<CatalogFacetValueRecord[]>;
  listCategories(): Promise<CatalogCategory[]>;
  listBrands(): Promise<CatalogBrand[]>;
  listProducts(input: ListCatalogProductsInput): Promise<CatalogProduct[]>;
  countProducts(input: ListCatalogProductsInput): Promise<number>;
  getProductBySlug(slug: string): Promise<CatalogProduct | null>;
  getProductById(id: string): Promise<CatalogProduct | null>;
  getProductDetailAggregateById?(id: string): Promise<CatalogProductDetailAggregate | null>;
  findCategoryByExternal1cId(
    external1cId: string,
  ): Promise<CatalogCategory | null>;
  findBrandByExternal1cId(external1cId: string): Promise<CatalogBrand | null>;
  findProductByExternal1cId(
    external1cId: string,
  ): Promise<CatalogProduct | null>;
  findProductBySku(sku: string): Promise<CatalogProduct | null>;
  upsertCategory(
    input: UpsertCatalogCategoryInput,
  ): Promise<CatalogUpsertResult<CatalogCategory>>;
  upsertBrand(
    input: UpsertCatalogBrandInput,
  ): Promise<CatalogUpsertResult<CatalogBrand>>;
  upsertProduct(
    input: UpsertCatalogProductInput,
  ): Promise<CatalogUpsertResult<CatalogProduct>>;
  listProductImages(productId: string): Promise<CatalogProductImage[]>;
  listProductDocuments(productId: string): Promise<CatalogProductDocument[]>;
  listProductDocumentsForProducts(productIds: string[]): Promise<CatalogProductDocument[]>;
  listProductAttributes?(productId: string): Promise<CatalogProductAttribute[]>;
  listProductAttributesForProducts?(productIds: string[]): Promise<CatalogProductAttribute[]>;
  findMatchingProductIds?(categoryIds: string[] | undefined, filters: CatalogAttributeFilters): Promise<string[]>;
  listAttributeFacets?(categoryIds: string[] | undefined, filters: CatalogAttributeFilters): Promise<CatalogFacetValueRecord[]>;
}
