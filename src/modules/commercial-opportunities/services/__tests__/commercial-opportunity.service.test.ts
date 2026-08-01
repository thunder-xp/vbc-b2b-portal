import { describe, expect, it, vi } from "vitest";

import type { CommercialOpportunityRepository } from "../../repositories";
import { CommercialOpportunityService } from "../commercial-opportunity.service";

const page = { items: [], totalCount: 0 };

function setup(accessState = "active", companyId: string | null = "company-1") {
  const repository: CommercialOpportunityRepository = { list: vi.fn().mockResolvedValue(page), dismiss: vi.fn().mockResolvedValue(undefined) };
  const workspaceContext = { getWorkspaceContext: vi.fn().mockResolvedValue({ accessState, companyId }) } as never;
  return { repository, service: new CommercialOpportunityService(repository, workspaceContext) };
}

describe("CommercialOpportunityService", () => {
  it("uses one bounded repository read with pagination", async () => {
    const { repository, service } = setup();
    const result = await service.list("user-1", { filter: "arrivals", page: 2, pageSize: 24 });
    expect(repository.list).toHaveBeenCalledOnce();
    expect(repository.list).toHaveBeenCalledWith({ companyId: "company-1", filter: "arrivals", limit: 24, offset: 24 });
    expect(result).toMatchObject({ page: 2, totalPages: 1 });
  });

  it("denies cross-company or inactive workspace access before the repository", async () => {
    const { repository, service } = setup("missing_membership", null);
    await expect(service.list("user-1")).rejects.toThrow("Partner workspace access is not active");
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("dismisses only after canonical workspace authorization", async () => {
    const { repository, service } = setup();
    await service.dismiss("user-1", "opportunity-1");
    expect(repository.dismiss).toHaveBeenCalledWith("opportunity-1");
  });

  it("enriches every mapped opportunity through one batched product-reference read", async () => {
    const { repository } = setup();
    vi.mocked(repository.list).mockResolvedValue({
      totalCount: 2,
      items: ["product-1", "product-2"].map((id) => ({
        id: `opportunity-${id}`,
        type: "repeat_purchase_available" as const,
        priority: 1,
        reasonCode: "repeat",
        reasonMetadata: {},
        secondaryReasons: [],
        fingerprint: id,
        firstDetectedAt: "2026-08-01T00:00:00Z",
        lastConfirmedAt: "2026-08-01T00:00:00Z",
        sourceType: "product",
        sourceId: id,
        product: { id, sku: id, name: id, slug: id, imageUrl: null, categoryName: null, partnerPrice: null, retailPrice: null, availableQuantity: 1, expectedArrivalDate: null, expectedArrivalQuantity: null },
        template: null,
      })),
    });
    const productReferences = {
      getProductReferencesByIds: vi.fn().mockResolvedValue([
        { productId: "product-1", slug: "product-1", sku: "product-1", name: "Product 1", thumbnail: "/camera.jpg", thumbnailFit: "contain", publicationState: "published" },
      ]),
    };
    const workspaceContext = { getWorkspaceContext: vi.fn().mockResolvedValue({ accessState: "active", companyId: "company-1" }) } as never;
    const result = await new CommercialOpportunityService(repository, workspaceContext, productReferences as never).list("user-1");

    expect(productReferences.getProductReferencesByIds).toHaveBeenCalledOnce();
    expect(productReferences.getProductReferencesByIds).toHaveBeenCalledWith("user-1", ["product-1", "product-2"]);
    expect(result.items[0]?.product?.imageUrl).toBe("/camera.jpg");
    expect(result.items[1]?.product?.imageUrl).toBeNull();
  });
});
