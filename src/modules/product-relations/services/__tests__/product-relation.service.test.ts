import { describe, expect, it, vi } from "vitest";

import { ProductRelationService, ProductRelationSummaryService } from "../product-relation.service";

describe("ProductRelationService", () => {
  it("uses one bounded relation read and two batch enrichments", async () => {
    const repository = { listForProduct: vi.fn(async () => [
      link("analog", "target-1", 0),
      link("analog", "target-2", 1),
      link("related", "target-3", 0),
    ]) };
    const references = { getProductReferencesByIds: vi.fn(async (_userId: string, ids: string[]) =>
      ids.map((id) => reference(id)),
    ) };
    const commercial = { getProductCommercialViews: vi.fn(async (_userId: string, ids: string[]) =>
      ids.map((id) => ({ productId: id })),
    ) };
    const service = new ProductRelationService(
      repository,
      references,
      commercial as never,
    );

    const result = await service.getSections("user-1", "source-1");

    expect(repository.listForProduct).toHaveBeenCalledWith("source-1", 5);
    expect(references.getProductReferencesByIds).toHaveBeenCalledOnce();
    expect(commercial.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(result.analogs).toHaveLength(2);
    expect(result.related).toHaveLength(1);
  });

  it("shows one relation honestly and drops inaccessible targets", async () => {
    const service = new ProductRelationService(
      { listForProduct: vi.fn(async () => [link("analog", "visible", 0), link("related", "hidden", 0)]) },
      { getProductReferencesByIds: vi.fn(async () => [reference("visible")]) },
      { getProductCommercialViews: vi.fn(async () => [{ productId: "visible" }]) } as never,
    );

    const result = await service.getSections("user-1", "source-1");

    expect(result.analogs).toHaveLength(1);
    expect(result.related).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("external_1c");
  });

  it("does not run enrichment when no relation is published", async () => {
    const references = { getProductReferencesByIds: vi.fn() };
    const commercial = { getProductCommercialViews: vi.fn() };
    const result = await new ProductRelationService(
      { listForProduct: vi.fn(async () => []) },
      references,
      commercial as never,
    ).getSections("user-1", "source-1");

    expect(result).toEqual({ analogs: [], related: [], synchronizedAt: null });
    expect(references.getProductReferencesByIds).not.toHaveBeenCalled();
    expect(commercial.getProductCommercialViews).not.toHaveBeenCalled();
  });

  it("loads a bounded summary without product or commercial enrichment", async () => {
    const repository = { listForProduct: vi.fn(async () => [
      link("analog", "target-1", 0),
      link("related", "target-2", 0),
    ]) };

    const result = await new ProductRelationSummaryService(repository).getSummary("source-1");

    expect(repository.listForProduct).toHaveBeenCalledWith("source-1", 1);
    expect(result).toEqual({ hasAnalogs: true, hasRelated: true });
  });
});

function link(relationType: "analog" | "related", targetProductId: string, sourcePriority: number) {
  return { relationType, targetProductId, sourcePriority, synchronizedAt: "2026-08-01T10:00:00Z" };
}

function reference(productId: string) {
  return {
    productId,
    sku: `SKU-${productId}`,
    name: `Product ${productId}`,
    slug: productId,
    thumbnail: null,
    thumbnailFit: "contain" as const,
    publicationState: "published" as const,
  };
}
