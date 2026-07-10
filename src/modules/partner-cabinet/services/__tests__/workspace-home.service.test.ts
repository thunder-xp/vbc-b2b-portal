import { describe, expect, it } from "vitest";

import type {
  CompanyAccessService,
  UserProfileService,
} from "../../../access-control/services";
import {
  CompanyStatus,
  MembershipStatus,
  UserStatus,
  UserType,
  type CompanyMembership,
  type PartnerCompany,
  type UserProfile,
} from "../../../access-control/types";
import type { CatalogService } from "../../../catalog/services";
import type { PricingInventoryService } from "../../../pricing-inventory/services";
import { DefaultWorkspaceHomeService } from "../workspace-home.service";

describe("DefaultWorkspaceHomeService", () => {
  it("builds a daily partner workspace from existing domain services", async () => {
    const service = new DefaultWorkspaceHomeService(
      fakeUserProfileService(),
      fakeCompanyAccessService(),
      fakeCatalogService(),
      fakePricingInventoryService(),
    );

    const workspace = await service.getWorkspaceHome("partner-1");

    expect(workspace.greetingName).toBe("Partner User");
    expect(workspace.company).toMatchObject({
      name: "Partner Company",
      priceType: "PRICE-TYPE-1C",
      manager: "Novotech partner manager",
    });
    expect(workspace.catalog).toEqual({
      totalProductsLabel: "2",
      brands: 3,
      categories: 4,
    });
    expect(workspace.pricing).toMatchObject({
      isActive: true,
      priceType: "PRICE-TYPE-1C",
      lastUpdate: "Available from current read model",
    });
    expect(workspace.inventory).toMatchObject({
      isSynchronized: true,
    });
    expect(workspace.activity.map((item) => item.label)).toContain(
      "Partner activated",
    );
  });
});

function fakeUserProfileService(): UserProfileService {
  return {
    async getCurrentProfile() {
      return makeProfile();
    },
    async createProfileAfterSignup() {
      return makeProfile();
    },
    async updateOwnProfile() {
      return makeProfile();
    },
    async ensureActiveUser() {
      return makeProfile();
    },
  };
}

function fakeCompanyAccessService(): CompanyAccessService {
  const membership = makeMembership();
  const company = makeCompany();

  return {
    async getOwnMemberships() {
      return [membership];
    },
    async getActiveCompanyContext() {
      return {
        user: makeProfile(),
        company,
        membership,
      };
    },
    async validateCompanyAccess() {
      return {
        isAllowed: true,
        context: {
          user: makeProfile(),
          company,
          membership,
        },
      };
    },
    async ensureActiveMembership() {
      return membership;
    },
  };
}

function fakeCatalogService(): CatalogService {
  return {
    async listCategories() {
      return Array.from({ length: 4 }, (_, index) => ({
        id: `category-${index}`,
        parentId: null,
        name: `Category ${index}`,
        slug: `category-${index}`,
        description: null,
      }));
    },
    async listBrands() {
      return Array.from({ length: 3 }, (_, index) => ({
        id: `brand-${index}`,
        name: `Brand ${index}`,
        slug: `brand-${index}`,
        description: null,
        logoUrl: null,
      }));
    },
    async listProducts() {
      return {
        products: [
          {
            id: "product-1",
            sku: "P-1",
            name: "Product 1",
            slug: "product-1",
            shortDescription: null,
            imageUrl: null,
            brand: null,
            category: null,
          },
          {
            id: "product-2",
            sku: "P-2",
            name: "Product 2",
            slug: "product-2",
            shortDescription: null,
            imageUrl: null,
            brand: null,
            category: null,
          },
        ],
        page: 1,
        pageSize: 48,
        hasNextPage: false,
        isDemoData: false,
      };
    },
    async getProductDetailBySlug() {
      return null;
    },
  };
}

function fakePricingInventoryService(): PricingInventoryService {
  return {
    async getProductCommercialViews(_userId, productIds) {
      return productIds.map((productId) => ({
        productId,
        price: {
          currency: "BGN",
          amount: 100,
          label: "Price: 100.00 BGN",
        },
        stock: {
          status: "in_stock",
          label: "In Stock: 12 available",
          availableQuantity: 12,
          expectedQuantity: null,
          expectedAt: null,
          warehouseCount: 1,
          lastUpdatedAt: "2026-07-10T08:00:00.000Z",
        },
        isDemoData: false,
      }));
    },
  };
}

function makeProfile(): UserProfile {
  return {
    id: "partner-1",
    email: "partner@example.com",
    fullName: "Partner User",
    phone: null,
    status: UserStatus.Active,
    userType: UserType.Partner,
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T08:00:00.000Z",
  };
}

function makeCompany(): PartnerCompany {
  return {
    id: "company-1",
    displayName: "Partner Company",
    external1cId: "PARTNER-1C",
    external1cContractId: "CONTRACT-1C",
    external1cPriceTypeId: "PRICE-TYPE-1C",
    status: CompanyStatus.Active,
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T08:00:00.000Z",
  };
}

function makeMembership(): CompanyMembership {
  return {
    id: "membership-1",
    userId: "partner-1",
    companyId: "company-1",
    roleId: "role-1",
    status: MembershipStatus.Active,
    approvedBy: "manager-1",
    approvedAt: "2026-07-10T08:00:00.000Z",
    revokedBy: null,
    revokedAt: null,
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T08:00:00.000Z",
  };
}
