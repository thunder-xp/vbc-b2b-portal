import type {
  CompanyAccessService,
  PermissionService,
} from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { PricingInventoryRepository } from "../repositories";
import type { ProductPrice, ProductStockBalance } from "../types";

export type ProductPriceViewDto = {
  currency: string;
  amount: number;
  label: string;
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
  price: ProductPriceViewDto | null;
  stock: ProductStockViewDto | null;
  isDemoData: boolean;
};

export interface PricingInventoryService {
  getProductCommercialViews(
    userId: string,
    productIds: string[],
  ): Promise<ProductCommercialViewDto[]>;
}

const PRICE_PERMISSION = "prices.view";
const STOCK_PERMISSION = "stock.view";
const LOW_STOCK_THRESHOLD = 5;

export class DefaultPricingInventoryService implements PricingInventoryService {
  constructor(
    private readonly pricingInventoryRepository: PricingInventoryRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
  ) {}

  async getProductCommercialViews(
    userId: string,
    productIds: string[],
  ): Promise<ProductCommercialViewDto[]> {
    const normalizedProductIds = normalizeProductIds(productIds);

    if (normalizedProductIds.length === 0) {
      return [];
    }

    const companyId = await this.resolveActiveCompanyId(userId);
    const [canViewPrices, canViewStock] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, PRICE_PERMISSION),
      this.permissionService.hasPermission(userId, companyId, STOCK_PERMISSION),
    ]);
    const [prices, stockBalances] = await Promise.all([
      canViewPrices
        ? this.pricingInventoryRepository.listPricesForProducts({
            productIds: normalizedProductIds,
            companyId,
          })
        : Promise.resolve<ProductPrice[]>([]),
      canViewStock
        ? this.pricingInventoryRepository.listStockForProducts(
            normalizedProductIds,
          )
        : Promise.resolve<ProductStockBalance[]>([]),
    ]);

    return normalizedProductIds.map((productId) => {
      const price = canViewPrices
        ? selectPriceForProduct(prices, productId, companyId)
        : null;
      const stock = canViewStock
        ? stockAvailabilityForProduct(stockBalances, productId)
        : null;
      const demoView =
        !price && !stock
          ? createDemoCommercialView(productId, canViewPrices, canViewStock)
          : null;

      if (demoView) {
        return demoView;
      }

      return {
        productId,
        price: price ? toPriceView(price, false) : null,
        stock,
        isDemoData: false,
      };
    });
  }

  private async resolveActiveCompanyId(userId: string): Promise<string> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const activeMembership = memberships.find(
      (membership) => membership.status === MembershipStatus.Active,
    );

    if (!activeMembership) {
      await this.companyAccessService.getActiveCompanyContext(userId, "");
      return "";
    }

    await this.companyAccessService.getActiveCompanyContext(
      userId,
      activeMembership.companyId,
    );

    return activeMembership.companyId;
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

function toPriceView(
  price: ProductPrice,
  isDemoData: boolean,
): ProductPriceViewDto {
  const amount = price.priceAmount;
  const formattedAmount = new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  const prefix = isDemoData ? "Demo price" : "Price";

  return {
    currency: price.currency,
    amount,
    label: `${prefix}: ${formattedAmount} ${price.currency}`,
  };
}

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
  price: ProductPriceViewDto;
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
    price: canViewPrices ? demoView.price : null,
    stock: canViewStock ? demoView.stock : null,
    isDemoData: true,
  };
}

const demoCommercialViews = new Map<string, DemoCommercialViewSource>([
  [
    "demo-product-dome-camera",
    {
      price: {
        currency: "BGN",
        amount: 100,
        label: "Demo price: 100.00 BGN",
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
      price: {
        currency: "BGN",
        amount: 150,
        label: "Demo price: 150.00 BGN",
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
      price: {
        currency: "BGN",
        amount: 200,
        label: "Demo price: 200.00 BGN",
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
