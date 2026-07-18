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
import type { ProductSupplierArrival } from "../../repositories";

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
    expect(result.retailPrice).toMatchObject({ currencyCode: "MDL", formattedAmount: "39,20 MDL" });
    expect(result.retailBelowPartnerPrice).toBe(true);
  });

  it("renders a resolved production RETAIL currency code 498 as Moldovan leu", async () => {
    const service = new DefaultPricingInventoryService(
      new FakePricingInventoryRepository([
        makePrice(null, 97.44, goldPriceType, "999"),
        makePrice(null, 2399, RETAIL_PRICE_TYPE_EXTERNAL_REF, "498"),
      ]),
      new FakeCompanyAccessService(),
      new FakePermissionService(),
    );

    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);

    expect(result.partnerPrice?.formattedAmount).toBe("$97.44");
    expect(result.retailPrice).toMatchObject({
      amount: 2399,
      currencyCode: "MDL",
      formattedAmount: "2\u00a0399,00 MDL",
    });
  });

  it("calculates the production-shaped commercial opportunity from a confirmed MDL per USD rate", async () => {
    const repository = new FakePricingInventoryRepository([
      makePrice(null, 48.95, goldPriceType, "999"),
      makePrice(null, 1526, RETAIL_PRICE_TYPE_EXTERNAL_REF, "498"),
    ], [], [], 17.1461);
    const service = new DefaultPricingInventoryService(
      repository,
      new FakeCompanyAccessService(),
      new FakePermissionService(),
    );

    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);

    expect(result.partnerPrice).toMatchObject({ amount: 48.95, currencyCode: "USD", formattedAmount: "$48.95" });
    expect(result.partnerPriceMdl).toMatchObject({
      amount: 839.301595,
      currencyCode: "MDL",
      formattedAmount: "839,30 MDL",
    });
    expect(result.commercialOpportunity).toMatchObject({
      formattedGrossProfit: "$40.05",
      formattedGrossProfitMdl: "686,70 MDL",
      formattedMarkup: "81.82%",
      formattedRetailPriceUsd: "$89.00 USD",
    });
    expect(result.commercialOpportunity?.retailPriceUsd).toBeCloseTo(89, 2);
    expect(result.commercialOpportunity?.grossProfitUsd).toBeCloseTo(40.05, 2);
    expect(result.commercialOpportunity?.grossProfitMdl).toBeCloseTo(686.698405, 6);
    expect(result.commercialOpportunity?.markupPercent).toBeCloseTo(81.82, 2);
    expect(repository.exchangeRateReads).toBe(1);
    expect(repository.lastPriceInputs).toHaveLength(2);
  });

  it("hides derived commercial values without a confirmed rate", async () => {
    const service = new DefaultPricingInventoryService(new FakePricingInventoryRepository([
      makePrice(null, 48.95, goldPriceType, "999"),
      makePrice(null, 1526, RETAIL_PRICE_TYPE_EXTERNAL_REF, "498"),
    ]), new FakeCompanyAccessService(), new FakePermissionService());

    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);

    expect(result.partnerPrice?.formattedAmount).toBe("$48.95");
    expect(result.partnerPriceMdl).toBeNull();
    expect(result.retailPrice?.formattedAmount).toBe("1\u00a0526,00 MDL");
    expect(result.commercialOpportunity).toBeNull();
  });

  it("reuses one bulk rate and two bulk price reads for multiple products", async () => {
    const repository = new FakePricingInventoryRepository([], [], [], 17.1461);
    const service = new DefaultPricingInventoryService(repository, new FakeCompanyAccessService(), new FakePermissionService());

    await service.getProductCommercialViews("user-1", ["product-1", "product-2", "product-3"]);

    expect(repository.exchangeRateReads).toBe(1);
    expect(repository.lastPriceInputs).toHaveLength(2);
    expect(repository.lastPriceInputs.every((input) => input.productIds.length === 3)).toBe(true);
  });

  it("preserves negative gross profit and markup", async () => {
    const service = new DefaultPricingInventoryService(new FakePricingInventoryRepository([
      makePrice(null, 100, goldPriceType, "999"),
      makePrice(null, 1000, RETAIL_PRICE_TYPE_EXTERNAL_REF, "498"),
    ], [], [], 20), new FakeCompanyAccessService(), new FakePermissionService());

    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);

    expect(result.commercialOpportunity).toMatchObject({ formattedGrossProfit: "-$50.00", formattedGrossProfitMdl: "-1\u00a0000,00 MDL", formattedMarkup: "-50.00%" });
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
      "out_of_stock",
    ]);
    expect(result[0]?.stock?.exactAvailableQuantity).toBe(24);
    expect(result[3]?.stock?.exactIncomingQuantity).toBe(10);
    expect(result[3]?.stock?.expectedArrival).toBeNull();
  });

  it("selects the earliest confirmed zero-characteristic arrival and sums only that date",async()=>{const arrivals:ProductSupplierArrival[]=[arrival("2026-08-02",4),arrival("2026-08-01",3),arrival("2026-08-01",2),{...arrival("2026-07-31",99),externalCharacteristicRef:"44444444-4444-4444-8444-444444444444"}];const service=new DefaultPricingInventoryService(new FakePricingInventoryRepository([], [makeStock("product-1",0,20)],arrivals),new FakeCompanyAccessService(),new FakePermissionService());const [result]=await service.getProductCommercialViews("user-1",["product-1"]);expect(result.stock).toMatchObject({status:"expected",expectedArrival:{expectedDate:"2026-08-01",expectedQuantity:5,sourceStatus:"confirmed_supply"}});expect(result.stock?.label).toContain("1 августа 2026 г.");});

  it("keeps available stock and confirmed arrival independently",async()=>{const service=new DefaultPricingInventoryService(new FakePricingInventoryRepository([], [makeStock("product-1",8,20)],[arrival("2026-08-01",5)]),new FakeCompanyAccessService(),new FakePermissionService());const [result]=await service.getProductCommercialViews("user-1",["product-1"]);expect(result.stock?.status).toBe("in_stock");expect(result.stock?.expectedArrival).toMatchObject({expectedQuantity:5,expectedDate:"2026-08-01",formattedExpectedDate:"1 августа 2026 г."});});
  it("treats a confirmed atomic arrival without a balance row as zero stock",async()=>{const service=new DefaultPricingInventoryService(new FakePricingInventoryRepository([],[],[arrival("2026-08-01",5)]),new FakeCompanyAccessService(),new FakePermissionService());const [result]=await service.getProductCommercialViews("user-1",["product-1"]);expect(result.stock).toMatchObject({status:"expected",exactAvailableQuantity:0,expectedArrival:{expectedDate:"2026-08-01",expectedQuantity:5}});});

  it("filters availability by positive stock and keeps stock-plus-arrival products in expected", async () => {
    const repository = new FakePricingInventoryRepository(
      [],
      [makeStock("stock-only", 3, null), makeStock("both", 7, null), makeStock("zero", 0, null)],
      [
        { ...arrival("2026-08-01", 4), productId: "arrival-only" },
        { ...arrival("2026-08-02", 2), productId: "both" },
      ],
    );
    const service = new DefaultPricingInventoryService(
      repository,
      new FakeCompanyAccessService(),
      new FakePermissionService(),
    );

    await expect(service.getProductIdsByAvailability("user-1", "in_stock")).resolves.toEqual(["stock-only", "both"]);
    await expect(service.getProductIdsByAvailability("user-1", "expected")).resolves.toEqual(["arrival-only", "both"]);
  });
});

class FakePricingInventoryRepository implements PricingInventoryRepository {
  lastPriceInputs: ListProductPricesInput[] = [];
  exchangeRateReads = 0;

  constructor(
    private readonly prices: ProductPrice[],
    private readonly stockBalances: ProductStockBalance[] = [],
    private readonly supplierArrivals: ProductSupplierArrival[] = [],
    private readonly mdlPerUsdRate: number | null = null,
  ) {}

  async getLatestUsdMdlExchangeRate() { this.exchangeRateReads += 1; return this.mdlPerUsdRate ? { sourceCode: "113" as const, mdlPerUsdRate: this.mdlPerUsdRate, effectiveDate: "2026-07-13", publishedAt: now } : null; }

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
  async listStockTotalsForProducts(){return this.stockBalances.map(item=>({productId:item.productId,physicalQuantity:item.availableQuantity,reservedQuantity:item.reservedQuantity??0,availableQuantity:item.availableQuantity,incomingQuantity:item.expectedQuantity??0,hasVariantStock:false,syncedAt:item.updatedFrom1cAt??now}));}
  async listSupplierArrivalsForProducts(){return this.supplierArrivals;}
  async listProductIdsWithPositiveStock(){return this.stockBalances.filter((item)=>item.availableQuantity>0).map((item)=>item.productId);}
  async listProductIdsWithConfirmedArrival(){return [...new Set(this.supplierArrivals.filter((item)=>item.expectedQuantity>0&&item.externalCharacteristicRef==="00000000-0000-0000-0000-000000000000").map((item)=>item.productId))];}

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
function arrival(expectedDate:string,expectedQuantity:number):ProductSupplierArrival{return{productId:"product-1",externalCharacteristicRef:"00000000-0000-0000-0000-000000000000",expectedDate,expectedQuantity,publishedAt:now};}

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
