export const CATALOG_PARTNER_PAGE_FIELDS = [
  "id",
  "sku",
  "name",
  "slug",
  "image_url",
  "brand_id",
  "brand_name",
  "brand_slug",
  "category_id",
  "category_parent_id",
  "category_name",
  "category_slug",
  "partner_price_amount",
  "partner_price_currency",
  "partner_price_currency_status",
  "partner_price_updated_at",
  "msrp_price_amount",
  "msrp_price_currency",
  "msrp_price_currency_status",
  "msrp_price_updated_at",
  "physical_quantity",
  "reserved_quantity",
  "available_quantity",
  "incoming_quantity",
  "has_variant_stock",
  "stock_synced_at",
  "expected_arrival_date",
  "expected_quantity",
  "arrival_published_at",
  "partner_rate",
  "retail_rate",
  "partner_rate_published_at",
  "retail_rate_published_at",
  "can_view_stock",
] as const;

export type CatalogPartnerPageRow = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  image_url: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_slug: string | null;
  category_id: string | null;
  category_parent_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  partner_price_amount: number | null;
  partner_price_currency: string | null;
  partner_price_currency_status: "resolved" | "unresolved" | null;
  partner_price_updated_at: string | null;
  msrp_price_amount: number | null;
  msrp_price_currency: string | null;
  msrp_price_currency_status: "resolved" | "unresolved" | null;
  msrp_price_updated_at: string | null;
  physical_quantity: number | null;
  reserved_quantity: number | null;
  available_quantity: number | null;
  incoming_quantity: number | null;
  has_variant_stock: boolean | null;
  stock_synced_at: string | null;
  expected_arrival_date: string | null;
  expected_quantity: number | null;
  arrival_published_at: string | null;
  partner_rate: number | null;
  retail_rate: number | null;
  partner_rate_published_at: string | null;
  retail_rate_published_at: string | null;
  can_view_stock: boolean;
};

export function isCatalogPartnerPageRow(value: unknown): value is CatalogPartnerPageRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (!CATALOG_PARTNER_PAGE_FIELDS.every((field) => field in row)) return false;

  return typeof row.id === "string"
    && typeof row.sku === "string"
    && typeof row.name === "string"
    && typeof row.slug === "string"
    && nullableString(row.image_url)
    && nullableNumber(row.partner_price_amount)
    && nullableString(row.partner_price_currency)
    && nullableNumber(row.msrp_price_amount)
    && nullableString(row.msrp_price_currency)
    && nullableNumber(row.available_quantity)
    && typeof row.can_view_stock === "boolean";
}

export function mapCatalogPartnerPageRow(row: CatalogPartnerPageRow): CatalogPartnerPageRecord {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    imageUrl: row.image_url,
    brand: row.brand_id && row.brand_name && row.brand_slug
      ? { id: row.brand_id, name: row.brand_name, slug: row.brand_slug }
      : null,
    category: row.category_id && row.category_name && row.category_slug
      ? {
          id: row.category_id,
          parentId: row.category_parent_id,
          name: row.category_name,
          slug: row.category_slug,
        }
      : null,
    commercialSnapshot: mapCommercialSnapshot(row),
  };
}

function mapCommercialSnapshot(row: CatalogPartnerPageRow): ProductCommercialSnapshot {
  const price = (
    amount: number | null,
    currency: string | null,
    currencyStatus: "resolved" | "unresolved" | null,
    updatedAt: string | null,
  ) => typeof amount === "number" && currency && updatedAt
    ? { priceAmount: amount, currency, currencyStatus: currencyStatus ?? "unresolved", updatedAt }
    : null;
  const rate = (value: number | null, publishedAt: string | null) =>
    typeof value === "number" && publishedAt ? { rate: value, publishedAt } : null;
  const stock = typeof row.available_quantity === "number" && row.stock_synced_at
    ? {
        productId: row.id,
        physicalQuantity: row.physical_quantity ?? 0,
        reservedQuantity: row.reserved_quantity ?? 0,
        availableQuantity: row.available_quantity,
        incomingQuantity: row.incoming_quantity ?? 0,
        hasVariantStock: row.has_variant_stock === true,
        syncedAt: row.stock_synced_at,
      }
    : null;
  const supplierArrival = row.expected_arrival_date && typeof row.expected_quantity === "number" && row.arrival_published_at
    ? {
        productId: row.id,
        externalCharacteristicRef: "00000000-0000-0000-0000-000000000000",
        expectedDate: row.expected_arrival_date,
        expectedQuantity: row.expected_quantity,
        publishedAt: row.arrival_published_at,
      }
    : null;

  return {
    productId: row.id,
    canViewStock: row.can_view_stock,
    partnerPrice: price(row.partner_price_amount, row.partner_price_currency, row.partner_price_currency_status, row.partner_price_updated_at),
    msrpPrice: price(row.msrp_price_amount, row.msrp_price_currency, row.msrp_price_currency_status, row.msrp_price_updated_at),
    stock,
    supplierArrival,
    partnerRate: rate(row.partner_rate, row.partner_rate_published_at),
    retailRate: rate(row.retail_rate, row.retail_rate_published_at),
  };
}

function nullableNumber(value: unknown): boolean {
  return value === null || typeof value === "number";
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}
import type { ProductCommercialSnapshot } from "../../../pricing-inventory/services";
import type { CatalogPartnerPageRecord } from "../catalog.repository";
