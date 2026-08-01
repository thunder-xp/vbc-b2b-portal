import type { ProductRelationType } from "../types";

export type ProductRelationLink = {
  relationType: ProductRelationType;
  targetProductId: string;
  sourcePriority: number;
  synchronizedAt: string;
};

export interface ProductRelationRepository {
  listForProduct(sourceProductId: string, limit: number): Promise<ProductRelationLink[]>;
}
