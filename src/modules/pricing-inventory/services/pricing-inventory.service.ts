import type {
  CompanyAccessService,
  PermissionService,
} from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { PricingInventoryRepository, ProductStockTotal } from "../repositories";
import type { ProductPrice } from "../types";
import { normalizeOneCCurrencyCode } from "../../../lib/currency";

export type ProductPriceViewDto = {
  currencyCode: string | null;
  amount: number;
  formattedAmount: string | null;
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
  hasVariantStock: boolean;
  lastUpdatedAt: string | null;
};

export type ProductCommercialViewDto = {
  productId: string;
  partnerPrice: ProductPriceViewDto | null;
  retailPrice: ProductPriceViewDto | null;
  stock: ProductStockViewDto | null;
  isDemoData: boolean;
};

export type ProductCommercialInternalDto = ProductCommercialViewDto & { retailBelowPartnerPrice: boolean };

export interface PricingInventoryService {
  getProductCommercialViews(
    userId: string,
    productIds: string[],
  ): Promise<ProductCommercialInternalDto[]>;
}

const PRICE_PERMISSION = "prices.view";
const STOCK_PERMISSION = "stock.view";
const LOW_STOCK_THRESHOLD = 5;
export const RETAIL_PRICE_TYPE_EXTERNAL_REF = "e181c772-93fc-11e9-94cb-000c2988d323";

export class DefaultPricingInventoryService implements PricingInventoryService {
  constructor(
    private readonly pricingInventoryRepository: PricingInventoryRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
  ) {}

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
    const [partnerPrices, retailPrices, stockBalances] = await Promise.all([
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
    ]);

    return normalizedProductIds.map((productId) => {
      const partnerPrice = canViewPrices
        ? selectPriceForProduct(partnerPrices, productId, companyId)
        : null;
      const retailPrice = canViewPrices
        ? selectPriceForProduct(retailPrices, productId, companyId)
        : null;
      const stock = canViewStock
        ? stockAvailabilityForProduct(stockBalances, productId)
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
        stock,
        isDemoData: false,
        retailBelowPartnerPrice: Boolean(partnerPrice && retailPrice && retailPrice.priceAmount < partnerPrice.priceAmount),
      };
    });
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
  };
}

function formatPrice(amount: number, currencyCode: string): string { if (currencyCode === "USD") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount); return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${currencyCode}`; }

function stockAvailabilityForProduct(stockBalances: ProductStockTotal[], productId: string): ProductStockViewDto {
  const total = stockBalances.find((item) => item.productId === productId);
  if (!total) {
    return {
      status: "unknown",
      label: "\u041d\u0430\u043b\u0438\u0447\u0438\u0435 \u0443\u0442\u043e\u0447\u043d\u044f\u0435\u0442\u0441\u044f",
      exactAvailableQuantity: null,
      exactPhysicalQuantity: null,
      exactReservedQuantity: null,
      exactIncomingQuantity: null,
      hasVariantStock: false,
      lastUpdatedAt: null,
    };
  }
  const common={exactAvailableQuantity:total.availableQuantity,exactPhysicalQuantity:total.physicalQuantity,exactReservedQuantity:total.reservedQuantity,exactIncomingQuantity:total.incomingQuantity,hasVariantStock:total.hasVariantStock,lastUpdatedAt:total.syncedAt};
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
        exactAvailableQuantity: 24, exactPhysicalQuantity:24, exactReservedQuantity:0, exactIncomingQuantity:0, hasVariantStock:false,
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
        exactAvailableQuantity:2,exactPhysicalQuantity:2,exactReservedQuantity:0,exactIncomingQuantity:0,hasVariantStock:false,
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
        exactAvailableQuantity:0,exactPhysicalQuantity:0,exactReservedQuantity:0,exactIncomingQuantity:10,hasVariantStock:false,
        lastUpdatedAt: demoNow,
      },
    },
  ],
]);
