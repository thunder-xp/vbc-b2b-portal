export interface ProductCoBuyRepository {
  listCandidateProductIds(
    sourceProductId: string,
    limit: number,
  ): Promise<string[]>;
}
export class ProductCoBuyRepositoryError extends Error {
  constructor() {
    super("Product co-buy recommendations could not be loaded.");
    this.name = "ProductCoBuyRepositoryError";
  }
}
