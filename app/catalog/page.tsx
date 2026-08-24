import type { Metadata } from "next";

import { PublicRetailCatalog } from "@/src/modules/public-retail/components/PublicRetailCatalog";
import { PublicRetailShowcase } from "@/src/modules/public-retail/components/PublicRetailShowcase";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale, publicRetailVisibleCategories } from "@/src/modules/public-retail/presentation";
import { buildPublicCategoryContent, type PublicCategoryContent } from "@/src/modules/public-retail/content";
import { buildPublicMetadata, publicBreadcrumbSchema, publicCatalogSeoState, publicCategorySeoDescription, publicLocalizedUrl } from "@/src/modules/public-retail/seo";
import { getPublicRetailCategories, getPublicRetailCategoryFacets, getPublicRetailService } from "@/src/modules/public-retail/server";
import { parseCatalogAttributeFilters } from "@/src/modules/catalog/services/catalog-sort-state";
import { publicRetailCatalogReturnHref } from "@/src/modules/public-retail/catalog-links";
import type { PublicRetailMerchandisingMode, PublicRetailPriceSort } from "@/src/modules/public-retail/types";
import { getPublicBlogForCategory } from "@/src/modules/public-blog/server";

type Params = Record<string, string | string[] | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const params = await searchParams;
  const locale = publicRetailLocale(params.lang);
  const requestedCategory = single(params.category)?.trim();
  const categories = requestedCategory ? publicRetailVisibleCategories(await getPublicRetailCategories(locale)) : [];
  const state = publicCatalogSeoState(params, new Set(categories.map((category) => category.slug)));
  const category = categories.find((item) => item.slug === state.categorySlug);
  const facets = category ? await getPublicRetailCategoryFacets(category.slug, locale) : [];
  const content = category ? buildPublicCategoryContent({ category, categories, facets, locale }) : null;
  const title = content
    ? content.metaTitle
    : locale === "ro" ? "Catalog de sisteme de securitate | Novotech" : "Каталог систем безопасности | Novotech";
  return buildPublicMetadata({
    locale,
    path: "/catalog",
    title,
    description: content?.metaDescription ?? publicCategorySeoDescription(undefined, undefined, locale),
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
  const returnHref = publicRetailCatalogReturnHref(locale, single(params.return));
  const page = Math.max(1, Number(single(params.page)) || 1);
  const attributeFilters = parseCatalogAttributeFilters(params);
  const service = getPublicRetailService();
  if (!hasListingIntent(params)) {
    const [showcase, categories] = await Promise.all([
      service.getRetailShowcase(locale),
      getPublicRetailCategories(locale),
    ]);
    const schema = [
      { "@type": "CollectionPage", name: locale === "ro" ? "Catalog de sisteme de securitate" : "Каталог систем безопасности", url: publicLocalizedUrl("/catalog", locale) },
      publicBreadcrumbSchema([
        { name: locale === "ro" ? "Principală" : "Главная", url: publicLocalizedUrl("/", locale) },
        { name: locale === "ro" ? "Catalog" : "Каталог", url: publicLocalizedUrl("/catalog", locale) },
      ]),
    ];
    return <PublicRetailShell languagePath="/catalog" locale={locale}><PublicStructuredData data={schema} /><main><PublicRetailShowcase categories={categories} locale={locale} showcase={showcase} /></main></PublicRetailShell>;
  }
  const merchandisingMode: PublicRetailMerchandisingMode | undefined = q ? undefined : view === "replenishment" ? "replenishment" : view === "special" ? "special" : view === "new" ? "new" : view === "hot" ? "hot" : view === "popular" ? "popular" : undefined;
  const priceSort: PublicRetailPriceSort | undefined = sort === "price_desc" ? "price_desc" : sort === "price_asc" ? "price_asc" : undefined;
  const mode = merchandisingMode ?? priceSort;
  const categoryFacetRead = category && !q && !availability && Object.keys(attributeFilters).length === 0
    ? getPublicRetailCategoryFacets(category, locale)
    : service.listRetailFacets({ categorySlug: category, search: q, availability, facets: attributeFilters, locale });
  const [categories, products, categoryFacets] = await Promise.all([
    getPublicRetailCategories(locale),
    service.listRetailProducts({ locale, categorySlug: category, search: q, availability, facets: attributeFilters, mode, page, pageSize: 24 }),
    categoryFacetRead,
  ]);

  const visibleCategories = publicRetailVisibleCategories(categories);
  const seoState = publicCatalogSeoState(params, new Set(visibleCategories.map((item) => item.slug)));
  const activeCategory = visibleCategories.find((item) => item.slug === seoState.categorySlug);
  const categoryContent = activeCategory
    ? buildPublicCategoryContent({ category: activeCategory, categories: visibleCategories, facets: categoryFacets, locale })
    : null;
  const usefulMaterials = activeCategory
    ? await getPublicBlogForCategory(activeCategory.id, locale).catch(() => [])
    : [];
  const canonicalUrl = publicLocalizedUrl("/catalog", locale, seoState.canonicalParams);
  const breadcrumbItems = publicCategoryBreadcrumbs(categoryContent, locale);
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
    publicBreadcrumbSchema(breadcrumbItems),
  ];
  return <PublicRetailShell languagePath="/catalog" locale={locale}><PublicStructuredData data={schema} /><main><PublicRetailCatalog blogArticles={usefulMaterials} breadcrumbs={breadcrumbItems} categories={categories} categoryContent={categoryContent} facets={categoryFacets} locale={locale} products={products} state={{ q, category, availability, attributeFilters, mode: merchandisingMode, sort: priceSort, returnHref, page }} /></main></PublicRetailShell>;
}

function publicCategoryBreadcrumbs(content: PublicCategoryContent | null, locale: "ru" | "ro") {
  return [
    { name: locale === "ro" ? "Principală" : "Главная", url: publicLocalizedUrl("/", locale) },
    { name: locale === "ro" ? "Catalog" : "Каталог", url: publicLocalizedUrl("/catalog", locale) },
    ...(content?.path.map((category) => ({
      name: category.name,
      url: publicLocalizedUrl("/catalog", locale, { category: category.slug }),
    })) ?? []),
  ];
}

function hasListingIntent(params: Params): boolean {
  return Object.keys(params).some((key) => ["q", "category", "availability", "view", "sort", "page", "return"].includes(key) || key.startsWith("attr."));
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
