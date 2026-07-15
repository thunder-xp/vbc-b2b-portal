export interface CatalogFavoriteRepository {
  exists(userId: string, companyId: string, productId: string): Promise<boolean>;
  add(userId: string, companyId: string, productId: string): Promise<void>;
  remove(userId: string, companyId: string, productId: string): Promise<void>;
}
