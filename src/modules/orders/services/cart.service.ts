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
  quantity: number;
  partnerUnitPrice: string | null;
  partnerLineTotal: string | null;
  availableStock: number | null;
  nearestArrivalDate: string | null;
  nearestArrivalQuantity: number | null;
};

export type CartDetailDto = {
  id: string | null;
  itemCount: number;
  lines: CartLineDto[];
  total: string | null;
  submitting: boolean;
};

export interface CartService {
  getCart(userId: string): Promise<CartDetailDto>;
  getItemCount(userId: string): Promise<number>;
  addItem(userId: string, productId: string, quantity: number): Promise<void>;
  updateQuantity(userId: string, itemId: string, quantity: number): Promise<void>;
  removeItem(userId: string, itemId: string): Promise<void>;
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
    if (!cart) return { id: null, itemCount: 0, lines: [], total: null, submitting: false };
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
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      lines,
      total: calculateTotal(items.map((item) => ({ quantity: item.quantity, view: viewsById.get(item.productId) }))),
      submitting: cart.status === "submitting",
    };
  }

  async getItemCount(userId: string): Promise<number> {
    const companyId = await this.resolveCompanyId(userId);
    const cart = await this.repository.findActive(companyId, userId);
    if (!cart) return 0;
    return (await this.repository.listItems(cart.id)).reduce((sum, item) => sum + item.quantity, 0);
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
    id, productId: product.id, slug: product.slug, productName: product.name, sku: product.sku, quantity,
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
