import "server-only";

import { unstable_cache } from "next/cache";

import { createPublicReadClient } from "@/src/lib/supabase/public";

const MAX_SITEMAP_PRODUCTS = 5_000;

type RawCategory = { slug?: unknown };
type RawRow = { slug?: unknown; category_path?: unknown; categoryPath?: unknown };

export type PublicSeoCategory = { slug: string };
export type PublicSeoProduct = { slug: string; categoryPath: PublicSeoCategory[] };

async function queryPublicSeoProducts(): Promise<PublicSeoProduct[]> {
  const { data, error } = await createPublicReadClient().rpc("list_public_retail_sitemap_inventory");

  if (error || !Array.isArray(data)) throw new Error("PUBLIC_SEO_INVENTORY_UNAVAILABLE");
  if (data.length > MAX_SITEMAP_PRODUCTS) throw new Error("PUBLIC_SEO_INVENTORY_LIMIT_EXCEEDED");
  return parsePublicSeoProducts(data as RawRow[]);
}

export const listPublicSeoProducts = unstable_cache(
  queryPublicSeoProducts,
  ["public-retail-seo-inventory-v1"],
  { revalidate: 3600 },
);

export function parsePublicSeoProducts(rows: RawRow[]): PublicSeoProduct[] {
  const seen = new Set<string>();
  const products: PublicSeoProduct[] = [];
  for (const row of rows) {
    if (typeof row.slug !== "string" || !isSafeSlug(row.slug) || seen.has(row.slug)) continue;
    const categoryPath = parseCategoryPath(row.category_path ?? row.categoryPath);
    if (categoryPath === null) continue;
    seen.add(row.slug);
    products.push({ slug: row.slug, categoryPath });
  }
  return products;
}

function parseCategoryPath(value: unknown): PublicSeoCategory[] | null {
  if (!Array.isArray(value)) return [];
  const result: PublicSeoCategory[] = [];
  for (const raw of value as RawCategory[]) {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.slug !== "string" || !isSafeSlug(raw.slug) || raw.slug === "project-equipment") return null;
    result.push({ slug: raw.slug });
  }
  return result;
}

function isSafeSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 180;
}
