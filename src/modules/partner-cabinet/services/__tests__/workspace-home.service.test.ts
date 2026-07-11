import { describe, expect, it } from "vitest";

import type { CatalogService } from "../../../catalog/services";
import type { PricingInventoryService } from "../../../pricing-inventory/services";
import type { PartnerWorkspaceContextService } from "../workspace-context.service";
import { DefaultWorkspaceHomeService } from "../workspace-home.service";

describe("DefaultWorkspaceHomeService", () => {
  it("builds an honest workspace summary from existing read models", async () => {
    const service = new DefaultWorkspaceHomeService(
      fakeContextService(),
      fakeCatalogService(),
      fakePricingInventoryService(),
    );

    const workspace = await service.getWorkspaceHome("partner-1");

    expect(workspace.greetingName).toBe("Partner User");
    expect(workspace.company).toMatchObject({
      name: "Partner Company",
      role: "Владелец компании",
      external1cCode: "000152",
      priceType: "GOLD",
      accessStatus: "Активен",
    });
    expect(workspace.catalog).toEqual({ totalProductsLabel: "2", brands: 3, categories: 4 });
    expect(workspace.operational).toEqual({
      activeOrders: 0,
      openProjects: 0,
      documentsRequiringAttention: 0,
      supportRequests: 0,
    });
    expect(workspace.activity).toEqual([]);
    expect(JSON.stringify(workspace)).not.toContain("f7df2069-884d-11ea-97e0-000c29cf9dd4");
  });
});

function fakeContextService(): PartnerWorkspaceContextService {
  return {
    async getWorkspaceContext() {
      return {
        userId: "partner-1",
        userDisplayName: "Partner User",
        userEmail: "partner@example.com",
        accessState: "active",
        companyId: "company-1",
        companyName: "Partner Company",
        companyStatus: "active",
        membershipId: "membership-1",
        membershipRole: "Владелец компании",
        external1cId: "f7df2069-884d-11ea-97e0-000c29cf9dd4",
        external1cCode: "000152",
        external1cContractId: null,
        external1cPriceTypeId: "33333333-3333-4333-8333-333333333333",
        priceTypeName: "GOLD",
        availableModules: [
          { key: "catalog", title: "Каталог", description: "Каталог", href: "/cabinet/catalog", availability: "available" },
          { key: "orders", title: "Заказы", description: "Заказы", href: null, availability: "coming_soon" },
        ],
      };
    },
  };
}

function fakeCatalogService(): CatalogService {
  return {
    async listCategories() { return Array.from({ length: 4 }, (_, index) => ({ id: `category-${index}`, parentId: null, name: `Category ${index}`, slug: `category-${index}`, description: null })); },
    async listBrands() { return Array.from({ length: 3 }, (_, index) => ({ id: `brand-${index}`, name: `Brand ${index}`, slug: `brand-${index}`, description: null, logoUrl: null })); },
    async listProducts() { return { products: [product("1"), product("2")], page: 1, pageSize: 48, hasNextPage: false, isDemoData: false }; },
    async getProductDetailBySlug() { return null; },
  };
}

function fakePricingInventoryService(): PricingInventoryService {
  return {
    async getProductCommercialViews(_userId, productIds) {
      return productIds.map((productId) => ({
        productId,
        price: { currency: "MDL", amount: 100, label: "100 MDL" },
        stock: { status: "in_stock", label: "В наличии", availableQuantity: 12, expectedQuantity: null, expectedAt: null, warehouseCount: 1, lastUpdatedAt: "2026-07-10T08:00:00.000Z" },
        isDemoData: false,
      }));
    },
  };
}

function product(id: string) {
  return { id: `product-${id}`, sku: `P-${id}`, name: `Product ${id}`, slug: `product-${id}`, shortDescription: null, imageUrl: null, brand: null, category: null };
}
