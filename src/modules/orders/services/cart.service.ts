import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { DomainConflictError, InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { PricingInventoryService, ProductCommercialViewDto } from "../../pricing-inventory/services";
import type { CartRepository, CheckoutConfigurationRepository } from "../repositories";
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
};

export type EstimateToCartSourceLine = {
  productId: string;
  quantity: number;
  snapshotPartnerPrice: number | null;
};

export type EstimateToCartResult = {
  cartId: string;
  added: number;
  updated: number;
  unavailable: number;
  inactive: number;
  missingPrice: number;
  skipped: number;
  changedPrice: number;
};

export interface CartService {
  getCart(userId: string): Promise<CartDetailDto>;
  getCheckoutIntent(userId: string, cartId: string): Promise<{
    cartId: string;
    intentVersion: number;
  }>;
  getItemCount(userId: string): Promise<number>;
  addItem(userId: string, productId: string, quantity: number): Promise<void>;
  addItems(userId: string, selections: LiveSelectionCartInput[]): Promise<LiveSelectionCartResult>;
  updateQuantity(userId: string, itemId: string, quantity: number): Promise<void>;
  removeItem(userId: string, itemId: string): Promise<void>;
  getEstimateSource(userId: string): Promise<CartEstimateSourceDto>;
  mergeEstimateProducts(userId: string, input: {
    estimateId: string;
    versionId: string | null;
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
      const product = productsById.get(item.productId);
      return product ? [toLine(item.id, item.quantity, product, viewsById.get(item.productId))] : [];
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

  async addItem(userId: string, productId: string, quantity: number): Promise<void> {
    const companyId = await this.resolveCompanyId(userId);
    const normalizedProductId = productId.trim();
    normalizeQuantity(quantity);
    if (!(await this.catalogService.getProductOrderIdentities(userId, [normalizedProductId])).length) {
      throw new NotFoundError("Catalog product was not found.");
    }
    await this.repository.addItem(companyId, normalizedProductId, quantity);
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
    return { ...result, priceChanged, missingPrice };
  }

  async updateQuantity(userId: string, itemId: string, quantity: number): Promise<void> {
    await this.resolveCompanyId(userId);
    const normalizedItemId = itemId.trim();
    try {
      await this.repository.updateItemQuantity(normalizedItemId, normalizeQuantity(quantity));
    } catch (error) {
      await this.rethrowCartMutationError(normalizedItemId, error);
    }
  }

  async removeItem(userId: string, itemId: string): Promise<void> {
    await this.resolveCompanyId(userId);
    const normalizedItemId = itemId.trim();
    try {
      await this.repository.removeItem(normalizedItemId);
    } catch (error) {
      await this.rethrowCartMutationError(normalizedItemId, error);
    }
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
    versionId: string | null;
    requestKey: string;
    lines: EstimateToCartSourceLine[];
  }): Promise<EstimateToCartResult> {
    const companyId = await this.resolveCompanyId(userId);
    const grouped = new Map<string, EstimateToCartSourceLine>();
    let skipped = 0;
    for (const line of input.lines) {
      if (!line.productId || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 9999) { skipped += 1; continue; }
      const previous = grouped.get(line.productId);
      grouped.set(line.productId, { ...line, quantity: Math.min(9999, (previous?.quantity ?? 0) + line.quantity) });
    }
    const ids = [...grouped.keys()];
    const [products, views, cart] = await Promise.all([
      this.catalogService.getProductsByIds(userId, ids),
      this.pricingInventoryService.getAuthoritativeProductCommercialViews
        ? this.pricingInventoryService.getAuthoritativeProductCommercialViews(
            userId,
            ids,
          )
        : this.pricingInventoryService.getProductCommercialViews(userId, ids),
      this.repository.findActive(companyId, userId),
    ]);
    const productIds = new Set(products.map((product) => product.id));
    const viewById = new Map(views.map((view) => [view.productId, view]));
    const existingItems = cart ? await this.repository.listItems(cart.id) : [];
    const existingIds = new Set(existingItems.map((item) => item.productId));
    const items: Array<{ productId: string; quantity: number }> = [];
    let unavailable = 0; let missingPrice = 0; let changedPrice = 0; let added = 0; let updated = 0;
    for (const [productId, line] of grouped) {
      if (!productIds.has(productId)) { unavailable += 1; continue; }
      const currentPrice = viewById.get(productId)?.partnerPrice?.amount;
      if (!Number.isFinite(currentPrice)) { missingPrice += 1; continue; }
      if (line.snapshotPartnerPrice !== null && Math.abs(line.snapshotPartnerPrice - Number(currentPrice)) >= 0.005) changedPrice += 1;
      items.push({ productId, quantity: line.quantity });
      if (existingIds.has(productId)) updated += 1; else added += 1;
    }
    const summary = { added, updated, unavailable, inactive: unavailable, missingPrice, skipped, changedPrice };
    const cartId = await this.repository.mergeEstimateProducts({
      companyId, estimateId: input.estimateId, versionId: input.versionId,
      requestKey: input.requestKey, items, summary,
    });
    return { cartId, ...summary };
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
    availableStock: view?.stock?.exactAvailableQuantity ?? null,
    nearestArrivalDate: view?.stock?.expectedArrival?.formattedExpectedDate ?? null,
    nearestArrivalQuantity: view?.stock?.expectedArrival?.expectedQuantity ?? null,
    availabilityGroup: resolveAvailabilityGroup(view),
  };
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
