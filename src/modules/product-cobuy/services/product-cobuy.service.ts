import "server-only";

import type { ProductReferenceService } from "../../catalog/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import type { ProductCoBuyRepository } from "../repositories/product-cobuy.repository";
import type { ProductCoBuyCard } from "../types";

export class ProductCoBuyService {
  constructor(
    private readonly repository: ProductCoBuyRepository,
    private readonly productReferences: ProductReferenceService,
    private readonly pricingInventory: PricingInventoryService,
  ) {}

  async getRecommendations(
    userId: string,
    sourceProductId: string,
    limit = 5,
  ): Promise<ProductCoBuyCard[]> {
    const startedAt = performance.now();
    const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 5);
    const candidateIds = [
      ...new Set(
        await this.repository.listCandidateProductIds(
          sourceProductId,
          boundedLimit,
        ),
      ),
    ]
      .filter((candidateId) => candidateId !== sourceProductId)
      .slice(0, boundedLimit);

    if (!candidateIds.length) return [];

    const [references, commercialViews] = await Promise.all([
      this.productReferences.getProductReferencesByIds(userId, candidateIds),
      this.pricingInventory.getProductCommercialViews(userId, candidateIds),
    ]);
    const referencesById = new Map(
      references.map((reference) => [reference.productId, reference]),
    );
    const commercialById = new Map(
      commercialViews.map((view) => [view.productId, view]),
    );
    const cards = candidateIds.flatMap((candidateId) => {
      const reference = referencesById.get(candidateId);
      if (!reference) return [];
      return [{
        id: reference.productId,
        sku: reference.sku,
        name: reference.name,
        slug: reference.slug,
        imageUrl: reference.thumbnail,
        imageFit: reference.thumbnailFit,
        commercialView: commercialById.get(reference.productId) ?? null,
      } satisfies ProductCoBuyCard];
    });

    console.info({
      event: "partner_product_cobuy_projection_loaded",
      sourceProductId,
      candidateCount: candidateIds.length,
      visibleProductCount: cards.length,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      liveOneCCallCount: 0,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });

    return cards;
  }
}
