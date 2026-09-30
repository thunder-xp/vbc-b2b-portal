import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { DomainConflictError, InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { PricingInventoryService, ProductCommercialViewDto } from "../../pricing-inventory/services";
import type { CartRepository, CheckoutConfigurationRepository, EstimateCartTransferResult } from "../repositories";
import { toPartnerCheckoutOptions, type PartnerCheckoutOptionsDto } from "./checkout-configuration.service";

export type CartLineDto = {
  id: string;
  productId: string;
  slug: string;
  productName: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  partnerUnitPrice?: string | null;
  partnerLineTotal?: string | null;
  retailUnitPrice: string | null;
  retailLineTotal: string | null;
  availableStock: number | null;
  nearestArrivalDate: string | null;
  nearestArrivalQuantity: number | null;
  availabilityGroup: "available" | "expected" | "confirmation";
  catalogVisible?: boolean;
};

export type CartDetailDto = {
  id: string | null;
  intentVersion: number | null;
  positionCount: number;
  totalUnitCount: number;
  lines: CartLineDto[];
  total?: string | null;
  retailReferenceTotal: string | null;
  commercialMode: "full" | "retail_only" | "hidden";
  submitting: boolean;
  reconciliationLock: {
    orderId: string;
    stale: boolean;
    correlationId: string | null;
    attemptCount: number;
  } | null;
  checkoutOptions?: PartnerCheckoutOptionsDto | null;
};

export type CartEstimateSourceDto = {
  companyId: string;
  cartId: string;
  lines: Array<{
    productId: string;
    sku: string;
    productName: string;
    quantity: number;
    partnerPrice: number | null;
    currencyCode: string | null;
    priceUpdatedAt: string | null;
  }>;
};

export type QuickOrderCartStateDto = {
  productQuantities: Record<string, number>;
  totalUnitCount: number;
};

export type LiveSelectionCartInput = {
  productId: string;
  quantity: number;
  snapshotPartnerPrice: number | null;
};

export type LiveSelectionCartResult = {
  cartId: string;
  added: number;
  updated: number;
  priceChanged: number;
  missingPrice: number;
  totalUnitCount: number;
};

export type EstimateToCartSourceLine = {
  lineId: string;
  productId: string;
  quantity: number;
  snapshotPartnerPrice: number | null;
  snapshotCurrencyCode?: string | null;
  skuSnapshot?: string | null;
  productNameSnapshot?: string | null;
};

export type EstimateToCartPreviewLine = EstimateToCartSourceLine & {
  classification: "ORDERABLE" | "PRODUCT_UNAVAILABLE";
  sku: string | null;
  productName: string;
  currentPrice: number | null;
  currentCurrencyCode: string | null;
  priceChanged: boolean;
  availableQuantity: number | null;
  stockStatus: "FULLY_AVAILABLE" | "PARTIAL_STOCK" | "OUT_OF_STOCK" | "STOCK_UNKNOWN" | "NOT_STOCKED";
  expectedArrivalDate: string | null;
};

export type EstimateToCartResult = EstimateCartTransferResult;

export interface CartService {
  getCart(userId: string): Promise<CartDetailDto>;
  getCheckoutIntent(userId: string, cartId: string): Promise<{
    cartId: string;
    intentVersion: number;
  }>;
  getItemCount(userId: string): Promise<number>;
  addItem(userId: string, productId: string, quantity: number): Promise<number>;
  addItems(userId: string, selections: LiveSelectionCartInput[]): Promise<LiveSelectionCartResult>;
  updateQuantity(userId: string, itemId: string, quantity: number): Promise<number>;
  removeItem(userId: string, itemId: string): Promise<number>;
  getEstimateSource(userId: string): Promise<CartEstimateSourceDto>;
  previewEstimateProducts(userId: string, lines: EstimateToCartSourceLine[]): Promise<EstimateToCartPreviewLine[]>;
  mergeEstimateProducts(userId: string, input: {
    estimateId: string;
    versionId: string;
    expectedRevision: number;
    requestKey: string;
    lines: EstimateToCartSourceLine[];
  }): Promise<EstimateToCartResult>;
}

const ORDERS_PERMISSION = "orders.manage";
const STALE_RECONCILIATION_MS = 10 * 60 * 1000;

export class DefaultCartService implements CartService {
  constructor(
    private readonly repository: CartRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly catalogService: CatalogService,
    private readonly pricingInventoryService: PricingInventoryService,
    private readonly checkoutConfigurationRepository?: CheckoutConfigurationRepository,
  ) {}

  async getCart(userId: string): Promise<CartDetailDto> {
    const companyId = await this.resolveCompanyId(userId);
    const visibility = this.pricingInventoryService.getCommercialVisibility
      ? await this.pricingInventoryService.getCommercialVisibility(userId)
      : null;
    const cart = await this.repository.findActive(companyId, userId);
    if (!cart) return {
      id: null,
      intentVersion: null,
      positionCount: 0,
      totalUnitCount: 0,
      lines: [],
      ...(visibility?.canViewPartnerTotals !== false ? { total: null } : {}),
      retailReferenceTotal: null,
      commercialMode: visibility?.mode ?? "full",
      submitting: false,
      reconciliationLock: null,
      checkoutOptions: null,
    };
    const [items, reconciliation] = await Promise.all([
      this.repository.listItems(cart.id),
      cart.status === "submitting"
        ? this.repository.findReconciliationLock(cart.id)
        : Promise.resolve(null),
    ]);
    const productIds = items.map((item) => item.productId);
    const [products, views, checkoutConfiguration] = await Promise.all([
      this.catalogService.getProductsByIds(userId, productIds),
      this.pricingInventoryService.getProductCommercialViews(userId, productIds),
      this.checkoutConfigurationRepository?.getByCompanyId(companyId) ?? null,
    ]);
    const productsById = new Map(products.map((product) => [product.id, product]));
    const viewsById = new Map(views.map((view) => [view.productId, view]));
    const lines = items.flatMap((item) => {
      const liveProduct = productsById.get(item.productId);
      const product = liveProduct ?? retainedProductCard(item.productId, item.retainedProduct);
      return product ? [toLine(item.id, item.quantity, product, viewsById.get(item.productId), Boolean(liveProduct))] : [];
    });
    return {
      id: cart.id,
      intentVersion: cart.intentVersion,
      positionCount: items.length,
      totalUnitCount: items.reduce((sum, item) => sum + item.quantity, 0),
      lines,
      ...(visibility?.canViewPartnerTotals !== false
        ? {
            total: calculateTotal(
              items.map((item) => ({
                quantity: item.quantity,
                view: viewsById.get(item.productId),
              })),
              "partner",
            ),
          }
        : {}),
      retailReferenceTotal: calculateTotal(
        items.map((item) => ({
          quantity: item.quantity,
          view: viewsById.get(item.productId),
        })),
        "retail",
      ),
      commercialMode: visibility?.mode ?? "full",
      submitting: cart.status === "submitting",
      reconciliationLock: reconciliation
        ? {
            orderId: reconciliation.orderId,
            stale: Date.now() - new Date(reconciliation.startedAt).getTime() >= STALE_RECONCILIATION_MS,
            correlationId: reconciliation.correlationId,
            attemptCount: reconciliation.attemptCount,
          }
        : null,
      checkoutOptions: checkoutConfiguration
        ? toPartnerCheckoutOptions(checkoutConfiguration)
        : null,
    };
  }

  async getCheckoutIntent(
    userId: string,
    cartId: string,
  ): Promise<{ cartId: string; intentVersion: number }> {
    const companyId = await this.resolveCompanyId(userId);
    const cart = await this.repository.findActive(companyId, userId);
    if (!cart || cart.id !== cartId || cart.status !== "active") {
      throw new InvalidStateError("Cart is not available for checkout.");
    }
    return { cartId: cart.id, intentVersion: cart.intentVersion };
  }

  async getItemCount(userId: string): Promise<number> {
    const companyId = await this.resolveCompanyId(userId);
    return this.repository.getActiveItemCount(companyId);
  }

  async getQuickOrderState(userId: string): Promise<QuickOrderCartStateDto> {
    const companyId = await this.resolveCompanyId(userId);
    const cart = await this.repository.findActive(companyId, userId);
    if (!cart) return { productQuantities: {}, totalUnitCount: 0 };
    const items = await this.repository.listItems(cart.id);
    return {
      productQuantities: Object.fromEntries(items.map((item) => [item.productId, item.quantity])),
      totalUnitCount: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  async addItem(userId: string, productId: string, quantity: number): Promise<number> {
    const companyId = await this.resolveCompanyId(userId);
    const normalizedProductId = productId.trim();
    normalizeQuantity(quantity);
    if (!(await this.catalogService.getProductOrderIdentities(userId, [normalizedProductId])).length) {
      throw new NotFoundError("Catalog product was not found.");
    }
    await this.repository.addItem(companyId, normalizedProductId, quantity);
    return this.repository.getActiveItemCount(companyId);
  }

  async addItems(userId: string, selections: LiveSelectionCartInput[]): Promise<LiveSelectionCartResult> {
    const companyId = await this.resolveCompanyId(userId);
    if (!Array.isArray(selections) || selections.length < 1 || selections.length > 50) {
      throw new InvalidStateError("Select between 1 and 50 products.");
    }
    const grouped = new Map<string, LiveSelectionCartInput>();
    for (const selection of selections) {
      const productId = selection.productId.trim();
      const quantity = normalizeQuantity(selection.quantity);
      if (!productId) throw new InvalidStateError("Product is required.");
      const current = grouped.get(productId);
      const mergedQuantity = (current?.quantity ?? 0) + quantity;
      if (mergedQuantity > 9999) throw new InvalidStateError("Quantity must be a whole number between 1 and 9999.");
      grouped.set(productId, { productId, quantity: mergedQuantity, snapshotPartnerPrice: selection.snapshotPartnerPrice });
    }
    const items = [...grouped.values()];
    const productIds = items.map((item) => item.productId);
    const [identities, commercialViews] = await Promise.all([
      this.catalogService.getProductOrderIdentities(userId, productIds),
      this.pricingInventoryService.getAuthoritativeProductCommercialViews
        ? this.pricingInventoryService.getAuthoritativeProductCommercialViews(userId, productIds)
        : this.pricingInventoryService.getProductCommercialViews(userId, productIds),
    ]);
    if (identities.length !== productIds.length) throw new NotFoundError("One or more catalog products were not found.");
    const commercialById = new Map(commercialViews.map((view) => [view.productId, view]));
    let priceChanged = 0;
    let missingPrice = 0;
    for (const item of items) {
      const currentPrice = commercialById.get(item.productId)?.partnerPrice?.amount;
      if (!Number.isFinite(currentPrice)) missingPrice += 1;
      else if (item.snapshotPartnerPrice !== null && Math.abs(Number(currentPrice) - item.snapshotPartnerPrice) >= 0.005) priceChanged += 1;
    }
    const result = await this.repository.addItems(
      companyId,
      items.map(({ productId, quantity }) => ({ productId, quantity })),
    );
    const totalUnitCount = await this.repository.getActiveItemCount(companyId);
    return { ...result, priceChanged, missingPrice, totalUnitCount };
  }

  async updateQuantity(userId: string, itemId: string, quantity: number): Promise<number> {
    const companyId = await this.resolveCompanyId(userId);
    const normalizedItemId = itemId.trim();
    try {
      await this.repository.updateItemQuantity(normalizedItemId, normalizeQuantity(quantity));
    } catch (error) {
      await this.rethrowCartMutationError(normalizedItemId, error);
    }
    return this.repository.getActiveItemCount(companyId);
  }

  async removeItem(userId: string, itemId: string): Promise<number> {
    const companyId = await this.resolveCompanyId(userId);
    const normalizedItemId = itemId.trim();
    try {
      await this.repository.removeItem(normalizedItemId);
    } catch (error) {
      await this.rethrowCartMutationError(normalizedItemId, error);
    }
    return this.repository.getActiveItemCount(companyId);
  }

  async getEstimateSource(userId: string): Promise<CartEstimateSourceDto> {
    const companyId = await this.resolveCompanyId(userId);
    const cart = await this.repository.findActive(companyId, userId);
    if (!cart || cart.status !== "active") throw new InvalidStateError("Корзина пуста или недоступна.");
    const items = await this.repository.listItems(cart.id);
    if (!items.length) throw new InvalidStateError("Корзина пуста.");
    const productIds = items.map((item) => item.productId);
    const [products, views] = await Promise.all([
      this.catalogService.getProductsByIds(userId, productIds),
      this.pricingInventoryService.getAuthoritativeProductCommercialViews
        ? this.pricingInventoryService.getAuthoritativeProductCommercialViews(
            userId,
            productIds,
          )
        : this.pricingInventoryService.getProductCommercialViews(userId, productIds),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const viewById = new Map(views.map((view) => [view.productId, view]));
    return {
      companyId,
      cartId: cart.id,
      lines: items.flatMap((item) => {
        const product = productById.get(item.productId);
        if (!product) return [];
        const price = viewById.get(item.productId)?.partnerPrice ?? null;
        return [{
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          quantity: item.quantity,
          partnerPrice: price?.amount ?? null,
          currencyCode: price?.currencyCode ?? null,
          priceUpdatedAt: price?.lastUpdatedAt ?? null,
        }];
      }),
    };
  }

  async mergeEstimateProducts(userId: string, input: {
    estimateId: string;
    versionId: string;
    expectedRevision: number;
    requestKey: string;
    lines: EstimateToCartSourceLine[];
  }): Promise<EstimateToCartResult> {
    const companyId = await this.resolveCompanyId(userId);
    const resolved = await this.resolveEstimateProducts(userId, input.lines);
    return this.repository.mergeEstimateProducts({
      companyId, estimateId: input.estimateId, versionId: input.versionId, expectedRevision: input.expectedRevision,
      requestKey: input.requestKey,
      items: resolved.map((line) => ({
        lineId: line.lineId,
        productId: line.productId,
        quantity: line.quantity,
        currentPrice: line.currentPrice,
        currencyCode: line.currentCurrencyCode,
        availableQuantity: line.availableQuantity,
        stockStatus: line.stockStatus,
      })),
    });
  }

  async previewEstimateProducts(userId: string, lines: EstimateToCartSourceLine[]): Promise<EstimateToCartPreviewLine[]> {
    await this.resolveCompanyId(userId);
    return this.resolveEstimateProducts(userId, lines);
  }

  private async resolveEstimateProducts(userId: string, inputLines: EstimateToCartSourceLine[]): Promise<EstimateToCartPreviewLine[]> {
    const lines = inputLines.filter((line) => line.lineId && line.productId && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 9999);
    if (lines.length !== inputLines.length) throw new InvalidStateError("Estimate contains an invalid product quantity.");
    const ids = [...new Set(lines.map((line) => line.productId))];
    const [products, views] = await Promise.all([
      this.catalogService.getProductsByIds(userId, ids),
      this.pricingInventoryService.getAuthoritativeProductCommercialViews
        ? this.pricingInventoryService.getAuthoritativeProductCommercialViews(
            userId,
            ids,
          )
        : this.pricingInventoryService.getProductCommercialViews(userId, ids),
    ]);
    const productIds = new Set(products.map((product) => product.id));
    const productById = new Map(products.map((product) => [product.id, product]));
    const viewById = new Map(views.map((view) => [view.productId, view]));
    return lines.map((line) => {
        const view = viewById.get(line.productId);
        const available = view?.stock?.exactAvailableQuantity ?? null;
        const stockStatus = !productIds.has(line.productId)
          ? "NOT_STOCKED" as const
          : available === null
            ? "STOCK_UNKNOWN" as const
            : available >= line.quantity
              ? "FULLY_AVAILABLE" as const
              : available > 0
                ? "PARTIAL_STOCK" as const
                : "OUT_OF_STOCK" as const;
        return {
          ...line,
          classification: productIds.has(line.productId) ? "ORDERABLE" as const : "PRODUCT_UNAVAILABLE" as const,
          sku: productById.get(line.productId)?.sku ?? line.skuSnapshot ?? null,
          productName: productById.get(line.productId)?.name ?? line.productNameSnapshot ?? line.productId,
          currentPrice: view?.partnerPrice?.amount ?? null,
          currentCurrencyCode: view?.partnerPrice?.currencyCode ?? null,
          priceChanged: pricesDiffer(
            line.snapshotPartnerPrice,
            line.snapshotCurrencyCode ?? null,
            view?.partnerPrice?.amount ?? null,
            view?.partnerPrice?.currencyCode ?? null,
          ),
          availableQuantity: stockStatus === "NOT_STOCKED" ? 0 : available,
          stockStatus,
          expectedArrivalDate: view?.stock?.expectedArrival?.expectedDate ?? null,
        };
      });
  }

  private async resolveCompanyId(userId: string): Promise<string> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await this.permissionService.ensurePermission(userId, context.company.id, ORDERS_PERMISSION);
    return context.company.id;
  }

  private async rethrowCartMutationError(itemId: string, originalError: unknown): Promise<never> {
    const reconciliation = await this.repository.findReconciliationLockForItem(itemId);
    if (!reconciliation) throw originalError;
    const stale = Date.now() - new Date(reconciliation.startedAt).getTime() >= STALE_RECONCILIATION_MS;
    throw new DomainConflictError(
      stale ? "CART_RECONCILIATION_STALE" : "CART_RECONCILIATION_LOCKED",
      reconciliation.correlationId ?? "",
    );
  }
}

function normalizeQuantity(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
    throw new InvalidStateError("Quantity must be a whole number between 1 and 9999.");
  }
  return quantity;
}

function toLine(
  id: string,
  quantity: number,
  product: Awaited<ReturnType<CatalogService["getProductsByIds"]>>[number],
  view?: ProductCommercialViewDto,
  catalogVisible = true,
): CartLineDto {
  return {
    id, productId: product.id, slug: product.slug, productName: product.name, sku: product.sku, imageUrl: product.imageUrl, quantity,
    ...(view?.partnerPrice
      ? {
          partnerUnitPrice: view.partnerPrice.formattedAmount,
          partnerLineTotal: formatLineTotal(view.partnerPrice, quantity),
        }
      : {}),
    retailUnitPrice: view?.retailPrice?.formattedAmount ?? null,
    retailLineTotal: formatLineTotal(view?.retailPrice, quantity),
    availableStock: catalogVisible ? view?.stock?.exactAvailableQuantity ?? null : 0,
    nearestArrivalDate: catalogVisible ? view?.stock?.expectedArrival?.formattedExpectedDate ?? null : null,
    nearestArrivalQuantity: catalogVisible ? view?.stock?.expectedArrival?.expectedQuantity ?? null : null,
    availabilityGroup: catalogVisible ? resolveAvailabilityGroup(view) : "confirmation",
    catalogVisible,
  };
}

function retainedProductCard(
  productId: string,
  retained: import("../types").CartItem["retainedProduct"],
): Awaited<ReturnType<CatalogService["getProductsByIds"]>>[number] | null {
  return retained ? {
    id: productId,
    sku: retained.sku,
    name: retained.name,
    slug: retained.slug,
    shortDescription: null,
    imageUrl: retained.imageUrl,
    brand: null,
    category: null,
    keyCharacteristics: [],
    datasheet: null,
  } : null;
}

function resolveAvailabilityGroup(view?: ProductCommercialViewDto): CartLineDto["availabilityGroup"] {
  if ((view?.stock?.exactAvailableQuantity ?? 0) > 0) return "available";
  if (view?.stock?.expectedArrival?.expectedDate) return "expected";
  return "confirmation";
}

function formatLineTotal(
  price: ProductCommercialViewDto["partnerPrice"] | undefined,
  quantity: number,
): string | null {
  return price?.currencyCode ? formatMoney(price.amount * quantity, price.currencyCode) : null;
}

function calculateTotal(
  lines: Array<{ quantity: number; view?: ProductCommercialViewDto }>,
  kind: "partner" | "retail",
): string | null {
  const prices = lines.map((line) =>
    kind === "partner" ? line.view?.partnerPrice : line.view?.retailPrice,
  );
  if (!lines.length || prices.some((price) => !price?.currencyCode)) return null;
  const currencies = [...new Set(prices.map((price) => price?.currencyCode))];
  if (currencies.length !== 1 || !currencies[0]) return null;
  return formatMoney(
    lines.reduce(
      (sum, line, index) => sum + (prices[index]?.amount ?? 0) * line.quantity,
      0,
    ),
    currencies[0],
  );
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount);
}

function pricesDiffer(
  snapshotAmount: number | null,
  snapshotCurrency: string | null,
  currentAmount: number | null,
  currentCurrency: string | null,
): boolean {
  if (snapshotAmount === null && currentAmount === null) return false;
  if (snapshotAmount === null || currentAmount === null) return true;
  return snapshotAmount !== currentAmount || snapshotCurrency !== currentCurrency;
}
