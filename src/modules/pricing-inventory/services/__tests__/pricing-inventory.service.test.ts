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
import { calculateReverseMarkupPercent, DefaultPricingInventoryService, MSRP_PRICE_TYPE_EXTERNAL_REF } from "../pricing-inventory.service";
import type {
  ListProductPricesInput,
  PricingInventoryRepository,
  PricingUpsertResult,
  FindProductStockBalanceInput,
  UpsertProductStockBalanceInput,
  UpsertProductPriceInput,
} from "../../repositories";
import type { CommercialRate, ProductPrice, ProductStockBalance } from "../../types";
import type { ProductSupplierArrival } from "../../repositories";

describe("DefaultPricingInventoryService", () => {
  it("loads prices through active company scope and prefers own company price", async () => {
    const repository = new FakePricingInventoryRepository([
      makePrice("other-company", 500, goldPriceType),
      makePrice("company-1", 100, goldPriceType),
      makePrice(null, 200, goldPriceType),
      makePrice(null, 120, MSRP_PRICE_TYPE_EXTERNAL_REF, ""),
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
    expect(repository.lastPriceInputs).toContainEqual({ productIds: ["product-1"], companyId: "company-1", external1cPriceTypeId: MSRP_PRICE_TYPE_EXTERNAL_REF });
    expect(result[0]?.partnerPrice?.amount).toBe(100);
    expect(result[0]?.msrpPriceUsd?.amount).toBe(120);
    expect(result[0]?.retailBelowPartnerPrice).toBe(false);
  });

  it("uses assigned partner USD and the independent MSRP USD source", async () => {
    const service = new DefaultPricingInventoryService(new FakePricingInventoryRepository([makePrice(null, 45.81, goldPriceType, "999"), makePrice(null, 39.2, MSRP_PRICE_TYPE_EXTERNAL_REF, "")], [], [], 17.3504, 17.7712), new FakeCompanyAccessService(), new FakePermissionService());
    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);
    expect(result.partnerPrice).toMatchObject({ currencyCode: "USD", formattedAmount: "$45.81" });
    expect(result.msrpPriceUsd).toMatchObject({ currencyCode: "USD", formattedAmount: "$39.20" });
    expect(result.retailPrice).toMatchObject({ currencyCode: "MDL", amount: 697, formattedAmount: "697 MDL" });
    expect(result.retailBelowPartnerPrice).toBe(true);
  });

  it("treats the confirmed MSRP price type as USD even when the legacy currency projection is blank", async () => {
    const service = new DefaultPricingInventoryService(
      new FakePricingInventoryRepository([
        makePrice(null, 97.44, goldPriceType, "999"),
        makePrice(null, 177, MSRP_PRICE_TYPE_EXTERNAL_REF, ""),
      ]),
      new FakeCompanyAccessService(),
      new FakePermissionService(),
    );

    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);

    expect(result.partnerPrice?.formattedAmount).toBe("$97.44");
    expect(result.msrpPriceUsd).toMatchObject({ amount: 177, currencyCode: "USD", formattedAmount: "$177.00" });
  });

  it("uses BCRU for partner MDL, RTL for MSRP MDL, and visible whole amounts for profit", async () => {
    const repository = new FakePricingInventoryRepository([
      makePrice(null, 103.94, goldPriceType, "USD"),
      makePrice(null, 177, MSRP_PRICE_TYPE_EXTERNAL_REF, ""),
    ], [], [], 17.3504, 17.7712);
    const service = new DefaultPricingInventoryService(repository, new FakeCompanyAccessService(), new FakePermissionService());

    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);

    expect(result.partnerPrice).toMatchObject({ amount: 103.94, currencyCode: "USD", formattedAmount: "$103.94" });
    expect(result.msrpPriceUsd).toMatchObject({ amount: 177, currencyCode: "USD", formattedAmount: "$177.00" });
    expect(result.partnerPriceMdl).toMatchObject({ amount: 1803, formattedAmount: "1\u00a0803 MDL" });
    expect(result.retailPrice).toMatchObject({ amount: 3146, formattedAmount: "3\u00a0146 MDL" });
    expect(result.commercialOpportunity).toMatchObject({ grossProfitMdl: 1343, formattedGrossProfitMdl: "1\u00a0343 MDL", formattedMarkup: "78.72%" });
    expect(result.commercialOpportunity?.reversePartnerUsd).toBeCloseTo(101.45628882686594, 12);
    expect(result.commercialOpportunity?.reverseRetailUsd).toBeCloseTo(181.32146809295463, 12);
    expect(result.commercialOpportunity?.markupPercent).not.toBeCloseTo((3146 / 1803 - 1) * 100, 4);
    expect(repository.exchangeRateReads).toBe(1);
    expect(repository.lastPriceInputs).toHaveLength(2);
  });

  it("rounds both displayed MDL values half up to whole amounts", async () => {
    const service = new DefaultPricingInventoryService(new FakePricingInventoryRepository([
      makePrice(null, 1, goldPriceType, "USD"),
      makePrice(null, 1, MSRP_PRICE_TYPE_EXTERNAL_REF, ""),
    ], [], [], 17.5, 16.5), new FakeCompanyAccessService(), new FakePermissionService());

    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);
    expect(result.partnerPriceMdl).toMatchObject({ amount: 18, formattedAmount: "18 MDL" });
    expect(result.retailPrice).toMatchObject({ amount: 17, formattedAmount: "17 MDL" });
    expect(result.commercialOpportunity?.grossProfitMdl).toBe(-1);
  });

  it("produces the confirmed 78.65 percent markup example without rounding reverse USD inputs", () => {
    const result = calculateReverseMarkupPercent("101.4631401238042", "181.2680115273775");
    expect(result.toString()).toBe("78.65405240385452259");
    expect(result.toDecimalPlaces(2).toFixed(2)).toBe("78.65");
  });

  it("does not substitute RTL when BCRU is missing", async () => {
    const service = new DefaultPricingInventoryService(new FakePricingInventoryRepository([
      makePrice(null, 103.94, goldPriceType, "USD"),
      makePrice(null, 177, MSRP_PRICE_TYPE_EXTERNAL_REF, ""),
    ], [], [], null, 17.7712), new FakeCompanyAccessService(), new FakePermissionService());
    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);
    expect(result.partnerPrice).not.toBeNull();
    expect(result.partnerPriceMdl).toBeNull();
    expect(result.retailPrice).not.toBeNull();
    expect(result.commercialOpportunity).toBeNull();
  });

  it("does not substitute BCRU when RTL is missing", async () => {
    const service = new DefaultPricingInventoryService(new FakePricingInventoryRepository([
      makePrice(null, 103.94, goldPriceType, "USD"),
      makePrice(null, 177, MSRP_PRICE_TYPE_EXTERNAL_REF, ""),
    ], [], [], 17.3504, null), new FakeCompanyAccessService(), new FakePermissionService());
    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);
    expect(result.partnerPriceMdl).not.toBeNull();
    expect(result.msrpPriceUsd).not.toBeNull();
    expect(result.retailPrice).toBeNull();
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
      makePrice(null, 40, MSRP_PRICE_TYPE_EXTERNAL_REF, ""),
    ], [], [], 20, 20), new FakeCompanyAccessService(), new FakePermissionService());

    const [result] = await service.getProductCommercialViews("user-1", ["product-1"]);

    expect(result.commercialOpportunity).toMatchObject({ grossProfitMdl: -1200, formattedGrossProfitMdl: "-1\u00a0200 MDL", formattedMarkup: "-60.00%" });
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
    private readonly retailUsdToMdlRate: number | null = mdlPerUsdRate,
  ) {}

  async getActiveCommercialRateSnapshot() {
    this.exchangeRateReads += 1;
    return {
      partnerPriceUsdToMdl: this.mdlPerUsdRate ? rate("partner_price_usd_to_mdl", this.mdlPerUsdRate) : null,
      retailPriceUsdToMdl: this.retailUsdToMdlRate ? rate("retail_price_usd_to_mdl", this.retailUsdToMdlRate) : null,
    };
  }

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
function rate(purpose: CommercialRate["purpose"], value: number): CommercialRate { return { id: `rate-${purpose}`, purpose, rate: value, effectiveAt: now, publishedAt: now, publishedBy: "internal-1", publisherName: "Manager", publisherEmail: null, sourceType: "manual_from_1c", sourceNote: "1C", evidenceComment: null, previousRateId: null, isActive: true }; }
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
