import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
} from "../types";

export type ListCatalogProductsInput = {
  categoryId?: string;
  brandId?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export interface CatalogRepository {
  listCategories(): Promise<CatalogCategory[]>;
  listBrands(): Promise<CatalogBrand[]>;
  listProducts(input: ListCatalogProductsInput): Promise<CatalogProduct[]>;
  getProductBySlug(slug: string): Promise<CatalogProduct | null>;
  getProductById(id: string): Promise<CatalogProduct | null>;
}
