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
  sort?: "default" | "name_asc" | "name_desc" | "sku_asc";
  limit?: number;
  offset?: number;
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
  listCategories(): Promise<CatalogCategory[]>;
  listBrands(): Promise<CatalogBrand[]>;
  listProducts(input: ListCatalogProductsInput): Promise<CatalogProduct[]>;
  countProducts(input: ListCatalogProductsInput): Promise<number>;
  getProductBySlug(slug: string): Promise<CatalogProduct | null>;
  getProductById(id: string): Promise<CatalogProduct | null>;
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
}
