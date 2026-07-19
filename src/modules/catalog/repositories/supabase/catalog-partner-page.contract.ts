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

function nullableNumber(value: unknown): boolean {
  return value === null || typeof value === "number";
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}
