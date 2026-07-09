import type {
  CatalogBrandDTO,
  CatalogCategoryDTO,
  CatalogProductDTO,
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
} from "../dto";

export interface CatalogProvider {
  fetchCategories(
    input: IntegrationSyncWindowDTO,
  ): Promise<IntegrationPageResultDTO<CatalogCategoryDTO>>;
  fetchBrands(
    input: IntegrationSyncWindowDTO,
  ): Promise<IntegrationPageResultDTO<CatalogBrandDTO>>;
  fetchProducts(
    input: IntegrationSyncWindowDTO,
  ): Promise<IntegrationPageResultDTO<CatalogProductDTO>>;
}
