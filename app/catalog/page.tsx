import type { Metadata } from "next";

import { PublicRetailCatalog } from "@/src/modules/public-retail/components/PublicRetailCatalog";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { getPublicRetailService } from "@/src/modules/public-retail/server";

type Params = Record<string, string | string[] | undefined>;

export const metadata: Metadata = { title: "Каталог систем безопасности | Novotech", description: "Розничный каталог профессионального оборудования для систем безопасности.", alternates: { canonical: "/catalog" } };

export default async function PublicCatalogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const locale = publicRetailLocale(params.lang);
  const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const q = single(params.q)?.trim() || undefined;
  const category = single(params.category)?.trim() || undefined;
  const availability = single(params.availability)?.trim() || undefined;
  const page = Math.max(1, Number(single(params.page)) || 1);
  const facets = Object.fromEntries(Object.entries(params).filter(([key]) => key.startsWith("facet_")).slice(0, 8).map(([key, value]) => [key.slice(6), (Array.isArray(value) ? value : [value]).filter((item): item is string => Boolean(item))]));
  const service = getPublicRetailService();
  const [categories, products, categoryFacets] = await Promise.all([
    service.listRetailCategories(locale),
    service.listRetailProducts({ locale, categorySlug: category, search: q, availability, facets, page, pageSize: 24 }),
    service.listRetailFacets(category, locale),
  ]);

  return <PublicRetailShell languagePath="/catalog" locale={locale}><main><PublicRetailCatalog categories={categories} facets={categoryFacets} locale={locale} products={products} state={{ q, category, availability, facets, page }} /></main></PublicRetailShell>;
}
