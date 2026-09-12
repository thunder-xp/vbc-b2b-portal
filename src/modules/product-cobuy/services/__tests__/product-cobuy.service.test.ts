import { describe, expect, it, vi } from "vitest";

import type { ProductReferenceService } from "../../../catalog/services";
import type { PricingInventoryService } from "../../../pricing-inventory/services";
import type { ProductCoBuyRepository } from "../../repositories/product-cobuy.repository";
import { ProductCoBuyService } from "../product-cobuy.service";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const FIRST_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_ID = "33333333-3333-4333-8333-333333333333";

describe("ProductCoBuyService", () => {
  it("keeps projection order and resolves references plus commercial state in batches", async () => {
    const repository = repositoryStub([FIRST_ID, SECOND_ID]);
    const productReferences = referenceStub();
    const pricingInventory = pricingStub();
    const service = new ProductCoBuyService(
      repository,
      productReferences,
      pricingInventory,
    );

    const result = await service.getRecommendations("user-1", SOURCE_ID, 5);

    expect(repository.listCandidateProductIds).toHaveBeenCalledWith(SOURCE_ID, 5);
    expect(productReferences.getProductReferencesByIds).toHaveBeenCalledOnce();
    expect(productReferences.getProductReferencesByIds).toHaveBeenCalledWith(
      "user-1",
      [FIRST_ID, SECOND_ID],
    );
    expect(pricingInventory.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(pricingInventory.getProductCommercialViews).toHaveBeenCalledWith(
      "user-1",
      [FIRST_ID, SECOND_ID],
    );
    expect(result.map((card) => card.id)).toEqual([FIRST_ID, SECOND_ID]);
    expect(result[0]?.commercialView?.productId).toBe(FIRST_ID);
  });

  it("removes self references and duplicate candidates defensively", async () => {
    const repository = repositoryStub([SOURCE_ID, FIRST_ID, FIRST_ID]);
    const productReferences = referenceStub();
    const pricingInventory = pricingStub();
    const service = new ProductCoBuyService(
      repository,
      productReferences,
      pricingInventory,
    );

    const result = await service.getRecommendations("user-1", SOURCE_ID, 20);

    expect(repository.listCandidateProductIds).toHaveBeenCalledWith(SOURCE_ID, 5);
    expect(result.map((card) => card.id)).toEqual([FIRST_ID]);
  });

  it("does no product or commercial fanout when the projection is empty", async () => {
    const productReferences = referenceStub();
    const pricingInventory = pricingStub();
    const service = new ProductCoBuyService(
      repositoryStub([]),
      productReferences,
      pricingInventory,
    );

    await expect(
      service.getRecommendations("user-1", SOURCE_ID),
    ).resolves.toEqual([]);
    expect(productReferences.getProductReferencesByIds).not.toHaveBeenCalled();
    expect(pricingInventory.getProductCommercialViews).not.toHaveBeenCalled();
  });
});

function repositoryStub(ids: string[]): ProductCoBuyRepository {
  return {
    listCandidateProductIds: vi.fn().mockResolvedValue(ids),
  };
}
function referenceStub(): ProductReferenceService {
  return {
    getProductReferencesByIds: vi.fn().mockResolvedValue([
      {
        productId: FIRST_ID,
        slug: "first-product",
        sku: "FIRST",
        name: "First product",
        thumbnail: "/first.webp",
        thumbnailFit: "contain",
        publicationState: "published",
      },
      {
        productId: SECOND_ID,
        slug: "second-product",
        sku: "SECOND",
        name: "Second product",
        thumbnail: "/second.webp",
        thumbnailFit: "cover",
        publicationState: "published",
      },
    ]),
  };
}

function pricingStub(): PricingInventoryService {
  return {
    getProductCommercialViews: vi.fn().mockResolvedValue([
      {
        productId: FIRST_ID,
        partnerPrice: null,
        retailPrice: null,
        stock: null,
        isDemoData: false,
      },
      {
        productId: SECOND_ID,
        partnerPrice: null,
        retailPrice: null,
        stock: null,
        isDemoData: false,
      },
    ]),
  } as unknown as PricingInventoryService;
}
