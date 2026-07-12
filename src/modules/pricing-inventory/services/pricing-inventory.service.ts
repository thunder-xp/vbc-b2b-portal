import type {
  CompanyAccessService,
  PermissionService,
} from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { PricingInventoryRepository } from "../repositories";
import type { ProductPrice, ProductStockBalance } from "../types";
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
  | "expected";

export type ProductStockViewDto = {
  status: ProductStockAvailability;
  label: string;
  availableQuantity: number;
  expectedQuantity: number | null;
  expectedAt: string | null;
  warehouseCount: number;
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
      canViewStock
        ? this.pricingInventoryRepository.listStockForProducts(
            normalizedProductIds,
          )
        : Promise.resolve<ProductStockBalance[]>([]),
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

function stockAvailabilityForProduct(
  stockBalances: ProductStockBalance[],
  productId: string,
): ProductStockViewDto | null {
  const productStock = stockBalances.filter(
    (stockBalance) => stockBalance.productId === productId && stockBalance.isActive,
  );

  if (productStock.length === 0) {
    return null;
  }

  const availableQuantity = productStock.reduce(
    (total, stockBalance) => total + stockBalance.availableQuantity,
    0,
  );

  if (availableQuantity > 0) {
    const status =
      availableQuantity > LOW_STOCK_THRESHOLD ? "in_stock" : "low_stock";

    return {
      status,
      label:
        status === "in_stock"
          ? `In Stock: ${formatQuantity(availableQuantity)} available`
          : `Low Stock: ${formatQuantity(availableQuantity)} available`,
      availableQuantity,
      expectedQuantity: totalExpectedQuantity(productStock),
      expectedAt: earliestExpectedAt(productStock),
      warehouseCount: activeWarehouseCount(productStock),
      lastUpdatedAt: latestUpdatedAt(productStock),
    };
  }

  const expectedQuantity = totalExpectedQuantity(productStock);
  const expectedAt = earliestExpectedAt(productStock);

  if (expectedQuantity !== null && expectedQuantity > 0) {
    return {
      status: "expected",
      label: `Expected: ${formatQuantity(expectedQuantity)}`,
      availableQuantity,
      expectedQuantity,
      expectedAt,
      warehouseCount: activeWarehouseCount(productStock),
      lastUpdatedAt: latestUpdatedAt(productStock),
    };
  }

  return {
    status: "out_of_stock",
    label: "Out of Stock",
    availableQuantity,
    expectedQuantity,
    expectedAt,
    warehouseCount: activeWarehouseCount(productStock),
    lastUpdatedAt: latestUpdatedAt(productStock),
  };
}

function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 3,
  }).format(quantity);
}

function totalExpectedQuantity(
  stockBalances: ProductStockBalance[],
): number | null {
  const expected = stockBalances
    .map((stockBalance) => stockBalance.expectedQuantity)
    .filter((quantity): quantity is number => quantity !== null);

  if (expected.length === 0) {
    return null;
  }

  return expected.reduce((total, quantity) => total + quantity, 0);
}

function earliestExpectedAt(stockBalances: ProductStockBalance[]): string | null {
  return (
    stockBalances
      .map((stockBalance) => stockBalance.expectedAt)
      .filter((value): value is string => value !== null)
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null
  );
}

function latestUpdatedAt(stockBalances: ProductStockBalance[]): string | null {
  return (
    stockBalances
      .map((stockBalance) => stockBalance.updatedFrom1cAt)
      .filter((value): value is string => value !== null)
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
  );
}

function activeWarehouseCount(stockBalances: ProductStockBalance[]): number {
  return new Set(stockBalances.map((stockBalance) => stockBalance.warehouseName))
    .size;
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
        availableQuantity: 24,
        expectedQuantity: null,
        expectedAt: null,
        warehouseCount: 1,
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
        availableQuantity: 2,
        expectedQuantity: null,
        expectedAt: null,
        warehouseCount: 1,
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
        availableQuantity: 0,
        expectedQuantity: 10,
        expectedAt: "2026-07-20T00:00:00.000Z",
        warehouseCount: 1,
        lastUpdatedAt: demoNow,
      },
    },
  ],
]);
