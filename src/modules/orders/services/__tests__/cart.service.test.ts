import { describe, expect, it, vi } from "vitest";

import { InvalidStateError } from "../../../access-control/services";
import type { CartRepository } from "../../repositories";
import { DefaultCartService } from "../cart.service";

describe("DefaultCartService", () => {
  it("adds an accessible catalog product through the scoped repository", async () => {
    const dependencies = makeDependencies();
    await dependencies.service.addItem("user-1", " product-1 ", 2);
    expect(dependencies.repository.addItem).toHaveBeenCalledWith("company-1", "product-1", 2);
    expect(dependencies.permissionService.ensurePermission).toHaveBeenCalledWith("user-1", "company-1", "orders.manage");
  });

  it.each([0, -1, 1.5, 10000])("rejects invalid quantity %s", async (quantity) => {
    const { service, repository } = makeDependencies();
    await expect(service.addItem("user-1", "product-1", quantity)).rejects.toBeInstanceOf(InvalidStateError);
    expect(repository.addItem).not.toHaveBeenCalled();
  });

  it("uses one bulk catalog read and one bulk commercial read for cart totals", async () => {
    const dependencies = makeDependencies();
    const cart = await dependencies.service.getCart("user-1");
    expect(dependencies.catalogService.getProductsByIds).toHaveBeenCalledOnce();
    expect(dependencies.pricingService.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(cart.lines[0]).toMatchObject({ quantity: 2, availableStock: 5 });
    expect(cart.lines[0]?.partnerLineTotal).toContain("20,00");
    expect(cart.total).toContain("20,00");
    expect(cart.positionCount).toBe(1);
    expect(cart.totalUnitCount).toBe(2);
  });

  it("loads the sidebar badge through the lightweight aggregate only", async () => {
    const dependencies = makeDependencies();

    await expect(dependencies.service.getItemCount("user-1")).resolves.toBe(2);

    expect(dependencies.repository.getActiveItemCount).toHaveBeenCalledWith("company-1");
    expect(dependencies.repository.findActive).not.toHaveBeenCalled();
    expect(dependencies.repository.listItems).not.toHaveBeenCalled();
    expect(dependencies.catalogService.getProductsByIds).not.toHaveBeenCalled();
    expect(dependencies.pricingService.getProductCommercialViews).not.toHaveBeenCalled();
  });

  it("merges duplicate estimate products once using current prices", async () => {
    const dependencies = makeDependencies();
    const result = await dependencies.service.mergeEstimateProducts("user-1", {
      estimateId: "estimate-1", versionId: "version-1", requestKey: "request-1",
      lines: [{ productId: "product-1", quantity: 2, snapshotPartnerPrice: 8 }, { productId: "product-1", quantity: 3, snapshotPartnerPrice: 8 }],
    });
    expect(dependencies.catalogService.getProductsByIds).toHaveBeenCalledOnce();
    expect(dependencies.pricingService.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(dependencies.repository.mergeEstimateProducts).toHaveBeenCalledWith(expect.objectContaining({ items: [{ productId: "product-1", quantity: 5 }] }));
    expect(result).toMatchObject({ updated: 1, changedPrice: 1 });
  });
});

function makeDependencies() {
  const repository = {
    getActiveItemCount: vi.fn().mockResolvedValue(2),
    findActive: vi.fn().mockResolvedValue({ id: "cart-1", companyId: "company-1", createdBy: "user-1", status: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" }),
    listItems: vi.fn().mockResolvedValue([{ id: "item-1", cartId: "cart-1", productId: "product-1", quantity: 2, createdAt: "2026-01-01", updatedAt: "2026-01-01" }]),
    addItem: vi.fn(), updateItemQuantity: vi.fn(), removeItem: vi.fn(), mergeEstimateProducts: vi.fn(),
  } satisfies CartRepository;
  const companyAccessService = {
    getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]),
    getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "company-1" } }),
  };
  const permissionService = { ensurePermission: vi.fn().mockResolvedValue({ isAllowed: true }) };
  const catalogService = {
    getProductOrderIdentities: vi.fn().mockResolvedValue([{ id: "product-1" }]),
    getProductsByIds: vi.fn().mockResolvedValue([{ id: "product-1", slug: "camera", name: "Camera", sku: "SKU-1" }]),
  };
  const pricingService = { getProductCommercialViews: vi.fn().mockResolvedValue([{ productId: "product-1", partnerPrice: { amount: 10, currencyCode: "USD", formattedAmount: "$10.00" }, stock: { exactAvailableQuantity: 5, expectedArrival: null } }]) };
  const service = new DefaultCartService(repository, companyAccessService as never, permissionService as never, catalogService as never, pricingService as never);
  return { service, repository, companyAccessService, permissionService, catalogService, pricingService };
}
