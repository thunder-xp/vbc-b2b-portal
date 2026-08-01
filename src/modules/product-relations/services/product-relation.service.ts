import type { ProductReferenceService } from "../../catalog/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import type { ProductRelationRepository } from "../repositories/product-relation.repository";
import type { ProductRelationCard, ProductRelationSections } from "../types";

export class ProductRelationService {
  constructor(
    private readonly repository: ProductRelationRepository,
    private readonly productReferences: ProductReferenceService,
    private readonly pricingInventory: PricingInventoryService,
  ) {}

  async getSections(userId: string, sourceProductId: string): Promise<ProductRelationSections> {
    const startedAt = performance.now();
    const links = await this.repository.listForProduct(sourceProductId, 5);
    const targetIds = [...new Set(links.map((link) => link.targetProductId))];
    if (!targetIds.length) return { analogs: [], related: [], synchronizedAt: null };
    const [references, commercialViews] = await Promise.all([
      this.productReferences.getProductReferencesByIds(userId, targetIds),
      this.pricingInventory.getProductCommercialViews(userId, targetIds),
    ]);
    const referencesById = new Map(references.map((value) => [value.productId, value]));
    const commercialById = new Map(commercialViews.map((value) => [value.productId, value]));
    const cards = links.flatMap((link) => {
      const reference = referencesById.get(link.targetProductId);
      if (!reference) return [];
      return [{
        relationType: link.relationType,
        card: {
          id: reference.productId,
          sku: reference.sku,
          name: reference.name,
          slug: reference.slug,
          imageUrl: reference.thumbnail,
          imageFit: reference.thumbnailFit,
          sourcePriority: link.sourcePriority,
          commercialView: commercialById.get(reference.productId) ?? null,
        } satisfies ProductRelationCard,
        synchronizedAt: link.synchronizedAt,
      }];
    });
    console.info({
      event: "product_relation_projection_completed",
      sourceProductId,
      relationRows: links.length,
      targetProducts: targetIds.length,
      visibleProducts: cards.length,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
    return {
      analogs: cards.filter((value) => value.relationType === "analog").map((value) => value.card),
      related: cards.filter((value) => value.relationType === "related").map((value) => value.card),
      synchronizedAt: cards.map((value) => value.synchronizedAt).sort().at(-1) ?? null,
    };
  }
}
