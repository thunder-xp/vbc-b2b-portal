import type { Metadata } from "next";

import { PublicRetailCatalog } from "@/src/modules/public-retail/components/PublicRetailCatalog";
import { PublicRetailShowcase } from "@/src/modules/public-retail/components/PublicRetailShowcase";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { getPublicRetailService } from "@/src/modules/public-retail/server";
import { parseCatalogAttributeFilters } from "@/src/modules/catalog/services/catalog-sort-state";

type Params = Record<string, string | string[] | undefined>;

export const metadata: Metadata = { title: "Каталог систем безопасности | Novotech", description: "Розничный каталог профессионального оборудования для систем безопасности.", alternates: { canonical: "/catalog" } };

export default async function PublicCatalogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const locale = publicRetailLocale(params.lang);
  const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const q = single(params.q)?.trim() || undefined;
  const category = single(params.category)?.trim() || undefined;
  const availability = single(params.availability)?.trim() || undefined;
  const view = single(params.view)?.trim();
  const sort = single(params.sort)?.trim();
  const page = Math.max(1, Number(single(params.page)) || 1);
  const attributeFilters = parseCatalogAttributeFilters(params);
  const service = getPublicRetailService();
  if (!hasListingIntent(params)) {
    const showcase = await service.getRetailShowcase(locale);
    return <PublicRetailShell languagePath="/catalog" locale={locale}><main><PublicRetailShowcase locale={locale} showcase={showcase} /></main></PublicRetailShell>;
  }
  const mode = q ? undefined : sort === "price_desc" ? "price_desc" : sort === "price_asc" ? "price_asc" : view === "special" ? "special" : view === "new" ? "new" : view === "hot" ? "hot" : view === "popular" ? "popular" : undefined;
  const [categories, products, categoryFacets] = await Promise.all([
    service.listRetailCategories(locale),
    service.listRetailProducts({ locale, categorySlug: category, search: q, availability, facets: attributeFilters, mode, page, pageSize: 24 }),
    service.listRetailFacets({ categorySlug: category, search: q, availability, facets: attributeFilters, locale }),
  ]);

  return <PublicRetailShell languagePath="/catalog" locale={locale}><main><PublicRetailCatalog categories={categories} facets={categoryFacets} locale={locale} products={products} state={{ q, category, availability, attributeFilters, mode, page }} /></main></PublicRetailShell>;
}

function hasListingIntent(params: Params): boolean {
  return Object.keys(params).some((key) => ["q", "category", "availability", "view", "sort", "page"].includes(key) || key.startsWith("attr."));
}
