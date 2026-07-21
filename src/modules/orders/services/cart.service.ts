import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { PricingInventoryService, ProductCommercialViewDto } from "../../pricing-inventory/services";
import type { CartRepository } from "../repositories";

export type CartLineDto = {
  id: string;
  productId: string;
  slug: string;
  productName: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  partnerUnitPrice: string | null;
  partnerLineTotal: string | null;
  availableStock: number | null;
  nearestArrivalDate: string | null;
  nearestArrivalQuantity: number | null;
};

export type CartDetailDto = {
  id: string | null;
  positionCount: number;
  totalUnitCount: number;
  lines: CartLineDto[];
  total: string | null;
  submitting: boolean;
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
  getItemCount(userId: string): Promise<number>;
  addItem(userId: string, productId: string, quantity: number): Promise<void>;
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

export class DefaultCartService implements CartService {
  constructor(
    private readonly repository: CartRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly catalogService: CatalogService,
    private readonly pricingInventoryService: PricingInventoryService,
  ) {}

  async getCart(userId: string): Promise<CartDetailDto> {
    const companyId = await this.resolveCompanyId(userId);
    const cart = await this.repository.findActive(companyId, userId);
    if (!cart) return { id: null, positionCount: 0, totalUnitCount: 0, lines: [], total: null, submitting: false };
    const items = await this.repository.listItems(cart.id);
    const productIds = items.map((item) => item.productId);
    const [products, views] = await Promise.all([
      this.catalogService.getProductsByIds(userId, productIds),
      this.pricingInventoryService.getProductCommercialViews(userId, productIds),
    ]);
    const productsById = new Map(products.map((product) => [product.id, product]));
    const viewsById = new Map(views.map((view) => [view.productId, view]));
    const lines = items.flatMap((item) => {
      const product = productsById.get(item.productId);
      return product ? [toLine(item.id, item.quantity, product, viewsById.get(item.productId))] : [];
    });
    return {
      id: cart.id,
      positionCount: items.length,
      totalUnitCount: items.reduce((sum, item) => sum + item.quantity, 0),
      lines,
      total: calculateTotal(items.map((item) => ({ quantity: item.quantity, view: viewsById.get(item.productId) }))),
      submitting: cart.status === "submitting",
    };
  }

  async getItemCount(userId: string): Promise<number> {
    const companyId = await this.resolveCompanyId(userId);
    return this.repository.getActiveItemCount(companyId);
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

  async updateQuantity(userId: string, itemId: string, quantity: number): Promise<void> {
    await this.resolveCompanyId(userId);
    await this.repository.updateItemQuantity(itemId.trim(), normalizeQuantity(quantity));
  }

  async removeItem(userId: string, itemId: string): Promise<void> {
    await this.resolveCompanyId(userId);
    await this.repository.removeItem(itemId.trim());
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
      this.pricingInventoryService.getProductCommercialViews(userId, productIds),
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
      this.pricingInventoryService.getProductCommercialViews(userId, ids),
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
    partnerUnitPrice: view?.partnerPrice?.formattedAmount ?? null,
    partnerLineTotal: formatLineTotal(view, quantity),
    availableStock: view?.stock?.exactAvailableQuantity ?? null,
    nearestArrivalDate: view?.stock?.expectedArrival?.formattedExpectedDate ?? null,
    nearestArrivalQuantity: view?.stock?.expectedArrival?.expectedQuantity ?? null,
  };
}

function formatLineTotal(view: ProductCommercialViewDto | undefined, quantity: number): string | null {
  const price = view?.partnerPrice;
  return price?.currencyCode ? formatMoney(price.amount * quantity, price.currencyCode) : null;
}

function calculateTotal(lines: Array<{ quantity: number; view?: ProductCommercialViewDto }>): string | null {
  if (!lines.length || lines.some((line) => !line.view?.partnerPrice?.currencyCode)) return null;
  const currencies = [...new Set(lines.map((line) => line.view?.partnerPrice?.currencyCode))];
  if (currencies.length !== 1 || !currencies[0]) return null;
  return formatMoney(lines.reduce((sum, line) => sum + (line.view?.partnerPrice?.amount ?? 0) * line.quantity, 0), currencies[0]);
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount);
}
