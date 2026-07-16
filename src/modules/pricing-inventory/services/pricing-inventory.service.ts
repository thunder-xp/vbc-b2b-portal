import type {
  CompanyAccessService,
  PermissionService,
} from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { PricingInventoryRepository, ProductStockTotal, ProductSupplierArrival, UsdMdlExchangeRate } from "../repositories";
import type { ProductPrice } from "../types";
import { normalizeOneCCurrencyCode } from "../../../lib/currency";

export type ProductPriceViewDto = {
  currencyCode: string | null;
  amount: number;
  formattedAmount: string | null;
  lastUpdatedAt?: string;
};

export type ProductStockAvailability =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "expected"
  | "unknown";

export type ProductStockViewDto = {
  status: ProductStockAvailability;
  label: string;
  exactAvailableQuantity: number | null;
  exactPhysicalQuantity: number | null;
  exactReservedQuantity: number | null;
  exactIncomingQuantity: number | null;
  expectedArrival: {
    expectedQuantity: number | null;
    expectedDate: string | null;
    formattedExpectedDate?: string | null;
    sourceStatus: "confirmed_supply";
  } | null;
  hasVariantStock: boolean;
  lastUpdatedAt: string | null;
};

export type CommercialOpportunityViewDto = {
  retailPriceUsd: number;
  grossProfitUsd: number;
  markupPercent: number;
  formattedGrossProfit: string;
  formattedMarkup: string;
};

export type ProductCommercialViewDto = {
  productId: string;
  partnerPrice: ProductPriceViewDto | null;
  retailPrice: ProductPriceViewDto | null;
  commercialOpportunity?: CommercialOpportunityViewDto | null;
  stock: ProductStockViewDto | null;
  isDemoData: boolean;
};

export type ProductCommercialInternalDto = ProductCommercialViewDto & { retailBelowPartnerPrice: boolean };
export type ProductAvailabilityFilter = "in_stock" | "expected";

export interface PricingInventoryService {
  listAvailableCurrencyCodes?(userId: string): Promise<string[]>;
  getProductCommercialViews(
    userId: string,
    productIds: string[],
  ): Promise<ProductCommercialInternalDto[]>;
  getProductIdsByAvailability?(
    userId: string,
    availability: ProductAvailabilityFilter,
  ): Promise<string[]>;
  getApprovedUsdMdlRate?(userId: string): Promise<number | null>;
  getApprovedUsdMdlRateSnapshot?(userId: string): Promise<UsdMdlExchangeRate | null>;
}

const PRICE_PERMISSION = "prices.view";
const STOCK_PERMISSION = "stock.view";
const LOW_STOCK_THRESHOLD = 5;
const ZERO_CHARACTERISTIC = "00000000-0000-0000-0000-000000000000";
export const RETAIL_PRICE_TYPE_EXTERNAL_REF = "e181c772-93fc-11e9-94cb-000c2988d323";

export class DefaultPricingInventoryService implements PricingInventoryService {
  constructor(
    private readonly pricingInventoryRepository: PricingInventoryRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
  ) {}

  async listAvailableCurrencyCodes(userId: string): Promise<string[]> {
    const company = await this.resolveActiveCompany(userId);
    const canViewPrices = await this.permissionService.hasPermission(userId, company.id, PRICE_PERMISSION);
    if (!canViewPrices || !this.pricingInventoryRepository.listAvailableCurrencyCodes) return [];
    return this.pricingInventoryRepository.listAvailableCurrencyCodes();
  }

  async getProductCommercialViews(
    userId: string,
    productIds: string[],
  ): Promise<ProductCommercialInternalDto[]> {
    const normalizedProductIds = normalizeProductIds(productIds);

    if (normalizedProductIds.length === 0) {
      return [];
    }

    const company = await this.resolveActiveCompany(userId);
    const companyId = company.id;
    const [canViewPrices, canViewStock] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, PRICE_PERMISSION),
      this.permissionService.hasPermission(userId, companyId, STOCK_PERMISSION),
    ]);
    const [partnerPrices, retailPrices, stockBalances, supplierArrivals, exchangeRate] = await Promise.all([
      canViewPrices && company.external1cPriceTypeId
        ? this.pricingInventoryRepository.listPricesForProducts({
            productIds: normalizedProductIds,
            companyId,
            external1cPriceTypeId: company.external1cPriceTypeId ?? undefined,
          })
        : Promise.resolve<ProductPrice[]>([]),
      canViewPrices
        ? this.pricingInventoryRepository.listPricesForProducts({ productIds: normalizedProductIds, companyId, external1cPriceTypeId: RETAIL_PRICE_TYPE_EXTERNAL_REF })
        : Promise.resolve<ProductPrice[]>([]),
      canViewStock && this.pricingInventoryRepository.listStockTotalsForProducts
        ? this.pricingInventoryRepository.listStockTotalsForProducts(normalizedProductIds)
        : Promise.resolve<ProductStockTotal[]>([]),
      canViewStock && this.pricingInventoryRepository.listSupplierArrivalsForProducts
        ? this.pricingInventoryRepository.listSupplierArrivalsForProducts(normalizedProductIds)
        : Promise.resolve<ProductSupplierArrival[]>([]),
      canViewPrices && this.pricingInventoryRepository.getLatestUsdMdlExchangeRate
        ? this.pricingInventoryRepository.getLatestUsdMdlExchangeRate()
        : Promise.resolve(null),
    ]);

    return normalizedProductIds.map((productId) => {
      const partnerPrice = canViewPrices
        ? selectPriceForProduct(partnerPrices, productId, companyId)
        : null;
      const retailPrice = canViewPrices
        ? selectPriceForProduct(retailPrices, productId, companyId)
        : null;
      const stock = canViewStock
        ? stockAvailabilityForProduct(stockBalances, supplierArrivals, productId)
        : null;
      const demoView =
        !partnerPrice && !retailPrice && !stock
          ? createDemoCommercialView(productId, canViewPrices, canViewStock)
          : null;

      if (demoView) {
        return { ...demoView, retailBelowPartnerPrice: false };
      }

      return {
        productId,
        partnerPrice: partnerPrice ? toPriceView(partnerPrice) : null,
        retailPrice: retailPrice ? toPriceView(retailPrice) : null,
        commercialOpportunity: createCommercialOpportunity(partnerPrice, retailPrice, exchangeRate?.mdlPerUsdRate ?? null),
        stock,
        isDemoData: false,
        retailBelowPartnerPrice: Boolean(partnerPrice && retailPrice && retailPrice.priceAmount < partnerPrice.priceAmount),
      };
    });
  }

  async getProductIdsByAvailability(
    userId: string,
    availability: ProductAvailabilityFilter,
  ): Promise<string[]> {
    const company = await this.resolveActiveCompany(userId);
    const canViewStock = await this.permissionService.hasPermission(
      userId,
      company.id,
      STOCK_PERMISSION,
    );
    if (!canViewStock) return [];

    if (availability === "in_stock") {
      return this.pricingInventoryRepository.listProductIdsWithPositiveStock?.() ?? [];
    }

    return this.pricingInventoryRepository.listProductIdsWithConfirmedArrival?.() ?? [];
  }

  async getApprovedUsdMdlRate(userId: string): Promise<number | null> {
    return (await this.getApprovedUsdMdlRateSnapshot(userId))?.mdlPerUsdRate ?? null;
  }

  async getApprovedUsdMdlRateSnapshot(userId: string): Promise<UsdMdlExchangeRate | null> {
    const company = await this.resolveActiveCompany(userId);
    const canViewPrices = await this.permissionService.hasPermission(
      userId,
      company.id,
      PRICE_PERMISSION,
    );
    if (!canViewPrices || !this.pricingInventoryRepository.getLatestUsdMdlExchangeRate) {
      return null;
    }

    const rate = await this.pricingInventoryRepository.getLatestUsdMdlExchangeRate();
    return rate && Number.isFinite(rate.mdlPerUsdRate) && rate.mdlPerUsdRate > 0 ? rate : null;
  }

  private async resolveActiveCompany(userId: string): Promise<{ id: string; external1cPriceTypeId: string | null }> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const activeMembership = memberships.find(
      (membership) => membership.status === MembershipStatus.Active,
    );

    if (!activeMembership) {
      await this.companyAccessService.getActiveCompanyContext(userId, "");
      return { id: "", external1cPriceTypeId: null };
    }

    const context = await this.companyAccessService.getActiveCompanyContext(
      userId,
      activeMembership.companyId,
    );

    return { id: activeMembership.companyId, external1cPriceTypeId: context.company.external1cPriceTypeId ?? null };
  }
}

function normalizeProductIds(productIds: string[]): string[] {
  return Array.from(
    new Set(
      productIds
        .map((productId) => productId.trim())
        .filter((productId) => productId.length > 0),
    ),
  );
}

function selectPriceForProduct(
  prices: ProductPrice[],
  productId: string,
  companyId: string,
): ProductPrice | null {
  const currentTime = Date.now();
  const productPrices = prices
    .filter((price) => {
      if (price.productId !== productId || !price.isActive) {
        return false;
      }

      const validFrom = Date.parse(price.validFrom);
      const validTo = price.validTo ? Date.parse(price.validTo) : null;

      return (
        validFrom <= currentTime &&
        (validTo === null || validTo >= currentTime)
      );
    })
    .sort((left, right) => {
      const leftCompanyPriority = left.companyId === companyId ? 0 : 1;
      const rightCompanyPriority = right.companyId === companyId ? 0 : 1;

      if (leftCompanyPriority !== rightCompanyPriority) {
        return leftCompanyPriority - rightCompanyPriority;
      }

      return Date.parse(right.validFrom) - Date.parse(left.validFrom);
    });

  return productPrices[0] ?? null;
}

function toPriceView(price: ProductPrice): ProductPriceViewDto {
  const amount = price.priceAmount;
  const currencyCode = price.currencyStatus === "resolved" ? normalizeOneCCurrencyCode(price.currency) : null;

  return {
    currencyCode,
    amount,
    formattedAmount: currencyCode ? formatPrice(amount, currencyCode) : null,
    lastUpdatedAt: price.updatedAt,
  };
}

function formatPrice(amount: number, currencyCode: string): string {
  if (currencyCode === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currencyCode}`;
}

function createCommercialOpportunity(
  partnerPrice: ProductPrice | null,
  retailPrice: ProductPrice | null,
  mdlPerUsdRate: number | null,
): CommercialOpportunityViewDto | null {
  if (!partnerPrice || !retailPrice || !Number.isFinite(mdlPerUsdRate) || mdlPerUsdRate === null || mdlPerUsdRate <= 0 || partnerPrice.priceAmount <= 0) return null;
  if (partnerPrice.currencyStatus !== "resolved" || retailPrice.currencyStatus !== "resolved") return null;
  if (normalizeOneCCurrencyCode(partnerPrice.currency) !== "USD" || normalizeOneCCurrencyCode(retailPrice.currency) !== "MDL") return null;

  const retailPriceUsd = retailPrice.priceAmount / mdlPerUsdRate;
  const grossProfitUsd = retailPriceUsd - partnerPrice.priceAmount;
  const markupPercent = (grossProfitUsd / partnerPrice.priceAmount) * 100;

  return {
    retailPriceUsd,
    grossProfitUsd,
    markupPercent,
    formattedGrossProfit: formatPrice(grossProfitUsd, "USD"),
    formattedMarkup: new Intl.NumberFormat("en-US", {
      style: "percent",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(markupPercent / 100),
  };
}

function stockAvailabilityForProduct(stockBalances: ProductStockTotal[], supplierArrivals:ProductSupplierArrival[], productId: string): ProductStockViewDto {
  const total = stockBalances.find((item) => item.productId === productId);
  if (!total) {
    const arrival=selectExpectedArrival(supplierArrivals,productId);
    if(arrival)return{status:"expected",label:expectedArrivalLabel(arrival.expectedDate),exactAvailableQuantity:0,exactPhysicalQuantity:0,exactReservedQuantity:0,exactIncomingQuantity:0,expectedArrival:{expectedQuantity:arrival.expectedQuantity,expectedDate:arrival.expectedDate,formattedExpectedDate:formatArrivalDate(arrival.expectedDate),sourceStatus:"confirmed_supply"},hasVariantStock:false,lastUpdatedAt:arrival.publishedAt};
    return {
      status: "unknown",
      label: "\u041d\u0430\u043b\u0438\u0447\u0438\u0435 \u0443\u0442\u043e\u0447\u043d\u044f\u0435\u0442\u0441\u044f",
      exactAvailableQuantity: null,
      exactPhysicalQuantity: null,
      exactReservedQuantity: null,
      exactIncomingQuantity: null,
      expectedArrival: null,
      hasVariantStock: false,
      lastUpdatedAt: null,
    };
  }
  const arrival=selectExpectedArrival(supplierArrivals,productId);
  const common={exactAvailableQuantity:total.availableQuantity,exactPhysicalQuantity:total.physicalQuantity,exactReservedQuantity:total.reservedQuantity,exactIncomingQuantity:total.incomingQuantity,expectedArrival:arrival?{expectedQuantity:arrival.expectedQuantity,expectedDate:arrival.expectedDate,formattedExpectedDate:formatArrivalDate(arrival.expectedDate),sourceStatus:"confirmed_supply" as const}:null,hasVariantStock:total.hasVariantStock,lastUpdatedAt:total.syncedAt};
  if(total.availableQuantity===0){if(arrival)return{status:"expected",label:expectedArrivalLabel(arrival.expectedDate),...common};return{status:"out_of_stock",label:"\u041d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438",...common};}
  if(total.availableQuantity>LOW_STOCK_THRESHOLD)return{status:"in_stock",label:`В наличии: ${formatQuantity(total.availableQuantity)} шт.`,...common};
  if(total.availableQuantity>0)return{status:"low_stock",label:`Осталось: ${formatQuantity(total.availableQuantity)} шт.`,...common};
  if(total.incomingQuantity>0)return{status:"expected",label:"Ожидается",...common};
  if(total.hasVariantStock)return{status:"unknown",label:"Наличие по вариантам",...common};
  return{status:"out_of_stock",label:"Нет в наличии",...common};
}

function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 3,
  }).format(quantity);
}

function selectExpectedArrival(arrivals:ProductSupplierArrival[],productId:string){const valid=arrivals.filter(row=>row.productId===productId&&row.externalCharacteristicRef===ZERO_CHARACTERISTIC&&row.expectedQuantity>0).sort((a,b)=>a.expectedDate.localeCompare(b.expectedDate));const first=valid[0];if(!first)return null;return{expectedDate:first.expectedDate,expectedQuantity:valid.filter(row=>row.expectedDate===first.expectedDate).reduce((sum,row)=>sum+row.expectedQuantity,0),publishedAt:first.publishedAt};}
function expectedArrivalLabel(value:string){return `\u041e\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044f \u043a \u043f\u043e\u0441\u0442\u0443\u043f\u043b\u0435\u043d\u0438\u044e\n${formatArrivalDate(value)}`;}
function formatArrivalDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));}


type DemoCommercialViewSource = {
  partnerPrice: ProductPriceViewDto;
  stock: ProductStockViewDto;
};

const demoNow = "2026-07-09T00:00:00.000Z";

function createDemoCommercialView(
  productId: string,
  canViewPrices: boolean,
  canViewStock: boolean,
): ProductCommercialViewDto | null {
  const demoView = demoCommercialViews.get(productId);

  if (!demoView || (!canViewPrices && !canViewStock)) {
    return null;
  }

  return {
    productId,
    partnerPrice: canViewPrices ? demoView.partnerPrice : null,
    retailPrice: null,
    commercialOpportunity: null,
    stock: canViewStock ? demoView.stock : null,
    isDemoData: true,
  };
}

const demoCommercialViews = new Map<string, DemoCommercialViewSource>([
  [
    "demo-product-dome-camera",
    {
      partnerPrice: {
        currencyCode: "BGN",
        amount: 100,
        formattedAmount: "100.00 BGN",
      },
      stock: {
        status: "in_stock",
        label: "Demo availability: In Stock: 24 available",
        exactAvailableQuantity: 24, exactPhysicalQuantity:24, exactReservedQuantity:0, exactIncomingQuantity:0, expectedArrival:null, hasVariantStock:false,
        lastUpdatedAt: demoNow,
      },
    },
  ],
  [
    "demo-product-controller",
    {
      partnerPrice: {
        currencyCode: "BGN",
        amount: 150,
        formattedAmount: "150.00 BGN",
      },
      stock: {
        status: "low_stock",
        label: "Demo availability: Low Stock: 2 available",
        exactAvailableQuantity:2,exactPhysicalQuantity:2,exactReservedQuantity:0,exactIncomingQuantity:0,expectedArrival:null,hasVariantStock:false,
        lastUpdatedAt: demoNow,
      },
    },
  ],
  [
    "demo-product-poe-switch",
    {
      partnerPrice: {
        currencyCode: "BGN",
        amount: 200,
        formattedAmount: "200.00 BGN",
      },
      stock: {
        status: "expected",
        label: "Demo availability: Expected: 10",
        exactAvailableQuantity:0,exactPhysicalQuantity:0,exactReservedQuantity:0,exactIncomingQuantity:10,expectedArrival:null,hasVariantStock:false,
        lastUpdatedAt: demoNow,
      },
    },
  ],
]);
