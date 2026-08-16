import type { Metadata } from "next";

import { PublicRetailCatalog } from "@/src/modules/public-retail/components/PublicRetailCatalog";
import { PublicRetailShowcase } from "@/src/modules/public-retail/components/PublicRetailShowcase";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale, publicRetailVisibleCategories } from "@/src/modules/public-retail/presentation";
import { buildPublicMetadata, publicBreadcrumbSchema, publicCatalogSeoState, publicLocalizedUrl } from "@/src/modules/public-retail/seo";
import { getPublicRetailCategories, getPublicRetailService } from "@/src/modules/public-retail/server";
import { parseCatalogAttributeFilters } from "@/src/modules/catalog/services/catalog-sort-state";

type Params = Record<string, string | string[] | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const params = await searchParams;
  const locale = publicRetailLocale(params.lang);
  const requestedCategory = single(params.category)?.trim();
  const categories = requestedCategory ? publicRetailVisibleCategories(await getPublicRetailCategories(locale)) : [];
  const state = publicCatalogSeoState(params, new Set(categories.map((category) => category.slug)));
  const category = categories.find((item) => item.slug === state.categorySlug);
  const title = category
    ? locale === "ro" ? `${category.name}: catalog și prețuri | Novotech` : `${category.name}: каталог и цены | Novotech`
    : locale === "ro" ? "Catalog de sisteme de securitate | Novotech" : "Каталог систем безопасности | Novotech";
  const fallback = category
    ? locale === "ro" ? `${category.name}: echipamente profesionale, prețuri cu amănuntul și disponibilitate.` : `${category.name}: профессиональное оборудование, розничные цены и наличие.`
    : locale === "ro" ? "Catalog cu amănuntul de echipamente profesionale pentru sisteme de securitate." : "Розничный каталог профессионального оборудования для систем безопасности.";
  return buildPublicMetadata({
    locale,
    path: "/catalog",
    title,
    description: category?.description?.trim() || fallback,
    canonicalParams: state.canonicalParams,
    index: state.index,
    follow: true,
  });
}

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
    const schema = [
      { "@type": "CollectionPage", name: locale === "ro" ? "Catalog de sisteme de securitate" : "Каталог систем безопасности", url: publicLocalizedUrl("/catalog", locale) },
      publicBreadcrumbSchema([
        { name: locale === "ro" ? "Principală" : "Главная", url: publicLocalizedUrl("/", locale) },
        { name: locale === "ro" ? "Catalog" : "Каталог", url: publicLocalizedUrl("/catalog", locale) },
      ]),
    ];
    return <PublicRetailShell languagePath="/catalog" locale={locale}><PublicStructuredData data={schema} /><main><PublicRetailShowcase locale={locale} showcase={showcase} /></main></PublicRetailShell>;
  }
  const mode = q ? undefined : sort === "price_desc" ? "price_desc" : sort === "price_asc" ? "price_asc" : view === "special" ? "special" : view === "new" ? "new" : view === "hot" ? "hot" : view === "popular" ? "popular" : undefined;
  const [categories, products, categoryFacets] = await Promise.all([
    getPublicRetailCategories(locale),
    service.listRetailProducts({ locale, categorySlug: category, search: q, availability, facets: attributeFilters, mode, page, pageSize: 24 }),
    service.listRetailFacets({ categorySlug: category, search: q, availability, facets: attributeFilters, locale }),
  ]);

  const visibleCategories = publicRetailVisibleCategories(categories);
  const seoState = publicCatalogSeoState(params, new Set(visibleCategories.map((item) => item.slug)));
  const activeCategory = visibleCategories.find((item) => item.slug === seoState.categorySlug);
  const canonicalUrl = publicLocalizedUrl("/catalog", locale, seoState.canonicalParams);
  const schema = [
    {
      "@type": "CollectionPage",
      name: activeCategory?.name ?? (locale === "ro" ? "Catalog" : "Каталог"),
      url: canonicalUrl,
      numberOfItems: products.totalCount,
      ...(activeCategory ? { mainEntity: {
        "@type": "ItemList",
        itemListElement: products.items.map((product, index) => ({
          "@type": "ListItem",
          position: products.offset + index + 1,
          name: product.name,
          url: publicLocalizedUrl(`/products/${product.slug}`, locale),
        })),
      } } : {}),
    },
    publicBreadcrumbSchema([
      { name: locale === "ro" ? "Principală" : "Главная", url: publicLocalizedUrl("/", locale) },
      { name: locale === "ro" ? "Catalog" : "Каталог", url: publicLocalizedUrl("/catalog", locale) },
      ...(activeCategory ? [{ name: activeCategory.name, url: canonicalUrl }] : []),
    ]),
  ];
  return <PublicRetailShell languagePath="/catalog" locale={locale}><PublicStructuredData data={schema} /><main><PublicRetailCatalog categories={categories} facets={categoryFacets} locale={locale} products={products} state={{ q, category, availability, attributeFilters, mode, page }} /></main></PublicRetailShell>;
}

function hasListingIntent(params: Params): boolean {
  return Object.keys(params).some((key) => ["q", "category", "availability", "view", "sort", "page"].includes(key) || key.startsWith("attr."));
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
