import type {
  CatalogBrandDTO,
  CatalogCategoryDTO,
  CatalogProductDTO,
  CatalogSnapshotDTO,
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
} from "../dto";

export interface CatalogProvider {
  fetchFullSnapshot?(): Promise<CatalogSnapshotDTO>;
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
