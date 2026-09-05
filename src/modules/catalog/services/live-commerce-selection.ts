import type { ProductCommercialViewDto } from "../../pricing-inventory";

export const LIVE_COMMERCE_SELECTION_STORAGE_KEY = "novotech:live-commerce-selection:v1";
export const LIVE_COMMERCE_SELECTION_ADD_EVENT = "novotech:live-selection-add";
export const LIVE_COMMERCE_SELECTION_MAX_PRODUCTS = 50;

export type LiveCommerceSelectionProduct = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  partnerPrice: { amount: number; currencyCode: string; formattedAmount: string; lastUpdatedAt: string | null } | null;
  stock: { status: NonNullable<ProductCommercialViewDto["stock"]>["status"]; label: string; exactAvailableQuantity: number | null; lastUpdatedAt: string | null } | null;
};

export type LiveCommerceSelectionItem = LiveCommerceSelectionProduct & {
  quantity: number;
};

export type LiveCommerceSelectionAddDetail = {
  product: LiveCommerceSelectionProduct;
  quantity: number;
};

export function toLiveCommerceSelectionProduct(input: {
  id: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  commercialView?: Pick<ProductCommercialViewDto, "partnerPrice" | "stock"> | null;
}): LiveCommerceSelectionProduct {
  return {
    id: input.id,
    sku: input.sku,
    name: input.name,
    slug: input.slug,
    imageUrl: input.imageUrl,
    partnerPrice: input.commercialView?.partnerPrice?.currencyCode
      ? {
          amount: input.commercialView.partnerPrice.amount,
          currencyCode: input.commercialView.partnerPrice.currencyCode,
          formattedAmount: input.commercialView.partnerPrice.formattedAmount ?? `${input.commercialView.partnerPrice.amount} ${input.commercialView.partnerPrice.currencyCode}`,
          lastUpdatedAt: input.commercialView.partnerPrice.lastUpdatedAt ?? null,
        }
      : null,
    stock: input.commercialView?.stock
      ? {
          status: input.commercialView.stock.status,
          label: input.commercialView.stock.label,
          exactAvailableQuantity: input.commercialView.stock.exactAvailableQuantity,
          lastUpdatedAt: input.commercialView.stock.lastUpdatedAt,
        }
      : null,
  };
}

export function emitLiveCommerceSelectionAdd(detail: LiveCommerceSelectionAddDetail): void {
  window.dispatchEvent(new CustomEvent<LiveCommerceSelectionAddDetail>(LIVE_COMMERCE_SELECTION_ADD_EVENT, { detail }));
}

export function mergeLiveCommerceSelection(
  current: LiveCommerceSelectionItem[],
  detail: LiveCommerceSelectionAddDetail,
): LiveCommerceSelectionItem[] {
  const quantity = normalizeSelectionQuantity(detail.quantity);
  const existing = current.find((item) => item.id === detail.product.id);
  if (existing) {
    return current.map((item) => item.id === detail.product.id
      ? { ...detail.product, quantity: Math.min(9999, item.quantity + quantity) }
      : item);
  }
  if (current.length >= LIVE_COMMERCE_SELECTION_MAX_PRODUCTS) return current;
  return [...current, { ...detail.product, quantity }];
}

export function normalizeStoredLiveCommerceSelection(value: unknown): LiveCommerceSelectionItem[] {
  if (!Array.isArray(value)) return [];
  const items = value.flatMap((candidate): LiveCommerceSelectionItem[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const row = candidate as Partial<LiveCommerceSelectionItem>;
    if (!validText(row.id) || !validText(row.sku) || !validText(row.name) || !validText(row.slug)) return [];
    const quantity = normalizeSelectionQuantity(Number(row.quantity));
    return [{
      id: row.id,
      sku: row.sku,
      name: row.name,
      slug: row.slug,
      imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : null,
      partnerPrice: normalizeStoredPrice(row.partnerPrice),
      stock: normalizeStoredStock(row.stock),
      quantity,
    }];
  });
  return items.slice(0, LIVE_COMMERCE_SELECTION_MAX_PRODUCTS);
}

export function normalizeSelectionQuantity(quantity: number): number {
  return Math.min(9999, Math.max(1, Math.trunc(quantity) || 1));
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 500;
}

function normalizeStoredPrice(value: unknown): LiveCommerceSelectionProduct["partnerPrice"] {
  if (!value || typeof value !== "object") return null;
  const price = value as Partial<NonNullable<LiveCommerceSelectionProduct["partnerPrice"]>>;
  if (!Number.isFinite(price.amount) || !validText(price.currencyCode) || !validText(price.formattedAmount)) return null;
  return {
    amount: Number(price.amount),
    currencyCode: price.currencyCode,
    formattedAmount: price.formattedAmount,
    lastUpdatedAt: typeof price.lastUpdatedAt === "string" ? price.lastUpdatedAt : null,
  };
}

function normalizeStoredStock(value: unknown): LiveCommerceSelectionProduct["stock"] {
  if (!value || typeof value !== "object") return null;
  const stock = value as Partial<NonNullable<LiveCommerceSelectionProduct["stock"]>>;
  const statuses = new Set(["in_stock", "low_stock", "out_of_stock", "expected", "unknown"]);
  if (!stock.status || !statuses.has(stock.status) || !validText(stock.label)) return null;
  return {
    status: stock.status,
    label: stock.label,
    exactAvailableQuantity: Number.isFinite(stock.exactAvailableQuantity) ? Number(stock.exactAvailableQuantity) : null,
    lastUpdatedAt: typeof stock.lastUpdatedAt === "string" ? stock.lastUpdatedAt : null,
  };
}
