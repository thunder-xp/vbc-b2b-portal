import { describe, expect, it } from "vitest";

import type {
  CompanyAccessService,
  PermissionService,
} from "../../../access-control/services";
import {
  CompanyStatus,
  MembershipStatus,
  UserStatus,
  UserType,
  type CompanyMembership,
} from "../../../access-control/types";
import { DefaultPricingInventoryService } from "../pricing-inventory.service";
import { RETAIL_PRICE_TYPE_EXTERNAL_REF } from "../pricing-inventory.service";
import type {
  ListProductPricesInput,
  PricingInventoryRepository,
  PricingUpsertResult,
  FindProductStockBalanceInput,
  UpsertProductStockBalanceInput,
  UpsertProductPriceInput,
} from "../../repositories";
import type { ProductPrice, ProductStockBalance } from "../../types";

describe("DefaultPricingInventoryService", () => {
  it("loads prices through active company scope and prefers own company price", async () => {
    const repository = new FakePricingInventoryRepository([
      makePrice("other-company", 500, goldPriceType),
      makePrice("company-1", 100, goldPriceType),
      makePrice(null, 200, goldPriceType),
      makePrice(null, 120, RETAIL_PRICE_TYPE_EXTERNAL_REF),
      makePrice(null, 999, "UNRELATED"),
    ]);
    const service = new DefaultPricingInventoryService(
      repository,
      new FakeCompanyAccessService(),
      new FakePermissionService(),
    );

    const result = await service.getProductCommercialViews("user-1", [
      "product-1",
    ]);

    expect(repository.lastPriceInputs).toContainEqual({
      productIds: ["product-1"],
      companyId: "company-1",
      external1cPriceTypeId: goldPriceType,
    });
    expect(repository.lastPriceInputs).toContainEqual({ productIds: ["product-1"], companyId: "company-1", external1cPriceTypeId: RETAIL_PRICE_TYPE_EXTERNAL_REF });
    expect(result[0]?.partnerPrice?.amount).toBe(100);
    expect(result[0]?.retailPrice?.amount).toBe(120);
    expect(result[0]?.retailBelowPartnerPrice).toBe(false);
  });

  it("normalizes 1C currency 999 and flags retail below partner price internally", async () => {
    const service = new DefaultPricingInventoryService(new FakePricingInventoryRepository([makePrice(null, 45.81, goldPriceType, "999"), makePrice(null, 39.2, RETAIL_PRICE_TYPE_EXTERNAL_REF, "MDL")]), new FakeCompanyAccessService(), new FakePermissionService());
    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);
    expect(result.partnerPrice).toMatchObject({ currencyCode: "USD", formattedAmount: "$45.81" });
    expect(result.retailPrice).toMatchObject({ currencyCode: "MDL", formattedAmount: "39.20 MDL" });
    expect(result.retailBelowPartnerPrice).toBe(true);
  });

  it("maps stock quantities to visible service-owned stock statuses", async () => {
    const repository = new FakePricingInventoryRepository([], [
      makeStock("product-in-stock", 24, null),
      makeStock("product-low-stock", 2, null),
      makeStock("product-out", 0, null),
      makeStock("product-expected", 0, 10),
    ]);
    const service = new DefaultPricingInventoryService(
      repository,
      new FakeCompanyAccessService(),
      new FakePermissionService(),
    );

    const result = await service.getProductCommercialViews("user-1", [
      "product-in-stock",
      "product-low-stock",
      "product-out",
      "product-expected",
    ]);

    expect(result.map((item) => item.stock?.status)).toEqual([
      "in_stock",
      "low_stock",
      "out_of_stock",
      "expected",
    ]);
    expect(result[0]?.stock?.availableQuantity).toBe(24);
    expect(result[3]?.stock?.expectedQuantity).toBe(10);
  });
});

class FakePricingInventoryRepository implements PricingInventoryRepository {
  lastPriceInputs: ListProductPricesInput[] = [];

  constructor(
    private readonly prices: ProductPrice[],
    private readonly stockBalances: ProductStockBalance[] = [],
  ) {}

  async listPricesForProducts(
    input: ListProductPricesInput,
  ): Promise<ProductPrice[]> {
    this.lastPriceInputs.push(input);
    return this.prices.filter(
      (price) => (price.companyId === null || price.companyId === input.companyId) && price.external1cPriceTypeId === input.external1cPriceTypeId,
    );
  }

  async listStockForProducts(): Promise<ProductStockBalance[]> {
    return this.stockBalances;
  }

  async findProductPrice(): Promise<ProductPrice | null> {
    return null;
  }

  async upsertProductPrice(
    input: UpsertProductPriceInput,
  ): Promise<PricingUpsertResult<ProductPrice>> {
    const record = makePrice(input.companyId, input.priceAmount, input.external1cPriceTypeId);
    return { record, created: true };
  }

  async findProductStockBalance(
    _input: FindProductStockBalanceInput,
  ): Promise<ProductStockBalance | null> {
    return null;
  }

  async upsertProductStockBalance(
    _input: UpsertProductStockBalanceInput,
  ): Promise<PricingUpsertResult<ProductStockBalance>> {
    throw new Error("Not needed");
  }
}

function makeMembership(): CompanyMembership {
  return {
    id: "membership-1",
    userId: "user-1",
    companyId: "company-1",
    roleId: "role-1",
    status: MembershipStatus.Active,
    approvedBy: null,
    approvedAt: null,
    revokedBy: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeActiveContext() {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      fullName: "User",
      phone: null,
      userType: UserType.External,
      status: UserStatus.Active,
      createdAt: now,
      updatedAt: now,
    },
    company: {
      id: "company-1",
      external1cId: "PARTNER-1",
      external1cPriceTypeId: "23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c",
      displayName: "Partner",
      status: CompanyStatus.Active,
      createdAt: now,
      updatedAt: now,
    },
    membership: makeMembership(),
  };
}

class NotNeeded {
  async upsertProductPrice() {
    throw new Error("Not needed");
  }
}

class FakeCompanyAccessService implements CompanyAccessService {
  async getOwnMemberships(): Promise<CompanyMembership[]> {
    return [makeMembership()];
  }

  async getActiveCompanyContext() {
    return makeActiveContext();
  }

  async validateCompanyAccess() {
    return {
      isAllowed: true,
      context: makeActiveContext(),
    };
  }

  async ensureActiveMembership(): Promise<CompanyMembership> {
    return makeMembership();
  }
}

class FakePermissionService implements PermissionService {
  async getRole() {
    return null;
  }

  async getRolePermissions() {
    return [];
  }

  async hasPermission(): Promise<boolean> {
    return true;
  }

  async ensurePermission(_userId: string, _companyId: string, permissionCode: string) {
    return {
      isAllowed: true,
      permissionCode,
      context: makeActiveContext(),
    };
  }
}

const now = "2026-07-09T00:00:00.000Z";

function makePrice(companyId: string | null, amount: number, external1cPriceTypeId: string | null = "BASE", currency = "BGN"): ProductPrice {
  return {
    id: `price-${companyId ?? "generic"}`,
    productId: "product-1",
    companyId,
    external1cPriceTypeId,
    currency,
    currencyStatus: "resolved",
    priceAmount: amount,
    validFrom: now,
    validTo: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}
const goldPriceType = "23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c";

function makeStock(
  productId: string,
  availableQuantity: number,
  expectedQuantity: number | null,
): ProductStockBalance {
  return {
    id: `stock-${productId}`,
    productId,
    warehouseName: "Main warehouse",
    availableQuantity,
    reservedQuantity: 0,
    expectedQuantity,
    expectedAt: expectedQuantity ? "2026-07-20T00:00:00.000Z" : null,
    updatedFrom1cAt: now,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}
