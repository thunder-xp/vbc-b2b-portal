import type { ProductCommercialViewDto } from "../../pricing-inventory";

export type QuickProductSearchResultDto = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  categoryName: string | null;
  commercialView: Pick<ProductCommercialViewDto, "partnerPrice" | "partnerPriceMdl" | "stock"> | null;
  matchKind: "exact_sku" | "exact_model" | "normalized_model" | "partial";
};

type ProductIdentity = Pick<QuickProductSearchResultDto, "id" | "sku" | "name">;

export function normalizeProductIdentifier(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");
}

export function quickProductMatchRank(query: string, product: ProductIdentity): number {
  const rawQuery = query.trim().toLocaleLowerCase("en");
  const normalizedQuery = normalizeProductIdentifier(query);
  const rawSku = product.sku.trim().toLocaleLowerCase("en");
  const rawName = product.name.trim().toLocaleLowerCase("en");

  if (rawSku === rawQuery) return 0;
  if (rawName === rawQuery) return 1;
  if (
    normalizedQuery.length >= 4
    && (normalizeProductIdentifier(product.sku) === normalizedQuery
      || normalizeProductIdentifier(product.name) === normalizedQuery)
  ) return 2;
  if (rawSku.startsWith(rawQuery)) return 3;
  if (normalizeProductIdentifier(product.name).startsWith(normalizedQuery)) return 4;
  return 5;
}

export function rankQuickProductResults<T extends ProductIdentity>(query: string, products: T[]): T[] {
  return products
    .map((product, index) => ({ product, index, rank: quickProductMatchRank(query, product) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ product }) => product);
}

export function quickProductMatchKind(
  query: string,
  product: ProductIdentity,
): QuickProductSearchResultDto["matchKind"] {
  const rank = quickProductMatchRank(query, product);
  if (rank === 0) return "exact_sku";
  if (rank === 1) return "exact_model";
  if (rank === 2) return "normalized_model";
  return "partial";
}

export function deriveNormalizedModelFallback(query: string): string | null {
  const trimmed = query.trim();
  if (!/^[a-z0-9]+$/i.test(trimmed) || !/[a-z]/i.test(trimmed) || !/\d/.test(trimmed)) return null;
  const match = normalizeProductIdentifier(trimmed).match(/^([a-z]{2,}\d{2,})/i);
  const fallback = match?.[1] ?? null;
  return fallback && fallback.length < trimmed.length ? fallback : null;
}
