import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getCatalogProductDetailByIdAction, getCatalogProductRouteIdentityAction } from "@/src/modules/catalog/actions/product-page.action";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import { ProductCharacteristicsTab, ProductDatasheetTab, ProductDescriptionTab, ProductOverviewTab, ProductPricingHistoryTab, ProductRelationPrompt } from "@/src/modules/catalog/components/ProductDetail";
import { buildProductDetailTabHref, parseCatalogReturnTarget, parseProductDetailTab, type ProductDetailTab } from "@/src/modules/catalog/services";
import { evaluateFreshness } from "@/src/modules/integration/freshness";
import { getProductCommercialViewsAction, getRetailPriceHistoryAction } from "@/src/modules/pricing-inventory/actions";
import type { ProductCommercialViewDto } from "@/src/modules/pricing-inventory";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { getProductRelationSectionsAction, getProductRelationSummaryAction, ProductRelationSectionsView } from "@/src/modules/product-relations";
import { getProductKnowledgeAction } from "@/src/modules/knowledge-base/actions";
import { KnowledgeCardView } from "@/src/modules/knowledge-base/landing-components";
import { getCatalogCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { PartnerProductCompetitiveIntelligenceService } from "@/src/modules/competitive-intelligence";
import { ProductCompetitiveIntelligence } from "@/src/modules/competitive-intelligence/components";
import { ProductCompetitorPricing } from "@/src/modules/competitive-intelligence/components/ProductCompetitorPricing";
import { CompetitorRetailPricingService } from "@/src/modules/competitive-intelligence/retail-pricing.service";

type ProductDetailPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ tab?: string | string[]; returnTo?: string | string[] }>;
};

export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const [{ slug }, resolvedSearchParams, locale] = await Promise.all([params, searchParams, getPartnerLocale()]);
  const activeTab = parseProductDetailTab(resolvedSearchParams?.tab);
  const returnTarget = parseCatalogReturnTarget(resolvedSearchParams?.returnTo);
  const copy = getCatalogCopy(locale);
  const identityResult = await getCatalogProductRouteIdentityAction(slug);
  if (!identityResult.success) return <EmptyCatalog message={identityResult.message} title={copy.productUnavailable} />;
  if (!identityResult.data) notFound();
  const productId = identityResult.data.id;
  const content = await renderTabContent({ activeTab, locale, productId, returnTarget, slug: identityResult.data.slug });

  return <>
    {content}
    {tabViewEvent(activeTab) ? <BehaviorViewEvent dedupeKey={`product-tab:${activeTab}:${productId}`} eventName={tabViewEvent(activeTab)!} productId={productId} route={`/cabinet/catalog/${identityResult.data.slug}?tab=${activeTab}`} sourceSurface={`product_${activeTab}_tab`} /> : null}
  </>;
}

async function renderTabContent({ activeTab, locale, productId, returnTarget, slug }: { activeTab: ProductDetailTab; locale: "ru" | "ro"; productId: string; returnTarget: string; slug: string }) {
  switch (activeTab) {
    case "description": {
      const product = await loadProduct(productId, activeTab);
      return product ? <ProductDescriptionTab locale={locale} product={product} /> : null;
    }
    case "characteristics": {
      const product = await loadProduct(productId, activeTab);
      return product ? <ProductCharacteristicsTab locale={locale} product={product} /> : null;
    }
    case "datasheet": {
      const product = await loadProduct(productId, activeTab);
      return product ? <ProductDatasheetTab locale={locale} product={product} /> : null;
    }
    case "pricing": {
      const historyResult = await getRetailPriceHistoryAction(productId, "all");
      return <ProductPricingHistoryTab error={historyResult.success ? null : historyResult.message} history={historyResult.success ? historyResult.data : null} locale={locale} productId={productId} />;
    }
    case "analytics": return renderAnalytics(productId, locale);
    case "analogs":
    case "related": return renderRelations(activeTab, productId, slug, locale);
    case "overview": return renderOverview(productId, returnTarget, locale);
  }
}

async function renderOverview(productId: string, returnTarget: string, locale: "ru" | "ro") {
  const commercialResult = await getProductCommercialViewsAction([productId]);
  const commercialView = commercialResult.success ? commercialResult.data[0] : undefined;
  const priceUpdatedAt = latestTimestamp([commercialView?.partnerPrice?.lastUpdatedAt, commercialView?.retailPrice?.lastUpdatedAt]);
  const priceFreshness = priceUpdatedAt ? evaluateFreshness(priceUpdatedAt, "price", "Цены") : null;
  const stockFreshness = commercialView?.stock?.lastUpdatedAt ? evaluateFreshness(commercialView.stock.lastUpdatedAt, "stock", "Остатки") : null;
  return <ProductOverviewTab
    commercialView={commercialView}
    locale={locale}
    priceFreshness={priceFreshness}
    returnTarget={returnTarget}
    stockFreshness={stockFreshness}
    supplementalContent={
      <Suspense fallback={<div aria-hidden="true" className="mt-4 h-20 animate-pulse rounded bg-zinc-100" />}>
        <OverviewSupplemental commercialView={commercialView} locale={locale} productId={productId} returnTarget={returnTarget} />
      </Suspense>
    }
  />;
}

async function OverviewSupplemental({ commercialView, locale, productId, returnTarget }: { commercialView?: ProductCommercialViewDto; locale: "ru" | "ro"; productId: string; returnTarget: string }) {
  const [relationSummaryResult, knowledgeResult, workspaceResult] = await Promise.all([
    getProductRelationSummaryAction(productId),
    getProductKnowledgeAction(productId),
    getPartnerWorkspaceContextAction(),
  ]);
  const companyId = workspaceResult.success ? workspaceResult.data.companyId : null;
  const canViewCompetitiveIntelligence = Boolean(workspaceResult.success && workspaceResult.data.capabilities.canViewCompetitiveIntelligence);
  const competitorPricing = companyId && canViewCompetitiveIntelligence
      ? await new CompetitorRetailPricingService().getProductPricing(companyId, productId, commercialView).catch((error: unknown) => {
          console.error({ event: "product_competitor_pricing_read_failed", errorType: error instanceof Error ? error.name : typeof error, productId });
          return [];
        })
      : [];
  const copy = getCatalogCopy(locale);
  return <div className="space-y-6">
    <div>
      <ProductCompetitorPricing analyticsHref={buildProductDetailTabHref("analytics", returnTarget)} items={competitorPricing} locale={locale} />
      <ProductRelationPrompt hasAnalogs={relationSummaryResult.success ? relationSummaryResult.data.hasAnalogs : false} locale={locale} relationsHref={buildProductDetailTabHref("analogs", returnTarget)} stock={commercialView?.stock} />
    </div>
    {knowledgeResult.success && knowledgeResult.data.length ? <section><h2 className="text-lg font-semibold">{copy.usefulMaterials}</h2><div className="mt-3 grid gap-3 xl:grid-cols-2">{knowledgeResult.data.map((article) => <KnowledgeCardView article={article} key={article.id} />)}</div></section> : null}
  </div>;
}

async function renderAnalytics(productId: string, locale: "ru" | "ro") {
  const workspaceResult = await getPartnerWorkspaceContextAction();
  const canView = Boolean(workspaceResult.success && workspaceResult.data.capabilities.canViewCompetitiveIntelligence);
  const companyId = workspaceResult.success ? workspaceResult.data.companyId : null;
  const data = canView && companyId ? await new PartnerProductCompetitiveIntelligenceService().getPartnerProduct(companyId, productId) : null;
  return data
    ? <ProductCompetitiveIntelligence data={data} locale={locale} productId={productId} />
    : <p className="border-y border-zinc-200 py-8 text-center text-sm text-zinc-600">{locale === "ro" ? "Analiza competitivă nu este disponibilă." : "Конкурентная аналитика недоступна."}</p>;
}

async function renderRelations(activeTab: "analogs" | "related", productId: string, slug: string, locale: "ru" | "ro") {
  const [relationResult, workspaceResult, commercialResult] = await Promise.all([
    getProductRelationSectionsAction(productId),
    getPartnerWorkspaceContextAction(),
    getProductCommercialViewsAction([productId]),
  ]);
  if (relationResult.success && workspaceResult.success) {
    return <ProductRelationSectionsView capabilities={workspaceResult.data.capabilities.productCard} companyId={workspaceResult.data.companyId} locale={locale} sections={relationResult.data} sourceProductId={productId} sourceSlug={slug} sourceStock={commercialResult.success ? commercialResult.data[0]?.stock : undefined} type={activeTab === "analogs" ? "analog" : "related"} userId={workspaceResult.data.userId} />;
  }
  return <p className="rounded-md border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">{getCatalogCopy(locale).relationsLoadError}</p>;
}

async function loadProduct(productId: string, tab: ProductDetailTab) {
  const result = await getCatalogProductDetailByIdAction(productId, detailProjection(tab));
  return result.success ? result.data : null;
}

function detailProjection(tab: ProductDetailTab) {
  return { includeAttributes: tab === "characteristics" || tab === "datasheet", includeDocuments: tab === "datasheet", includeImages: false };
}

function tabViewEvent(tab: ProductDetailTab) {
  switch (tab) {
    case "overview": return "product_overview_viewed" as const;
    case "description": return "product_description_viewed" as const;
    case "characteristics": return "product_characteristics_viewed" as const;
    case "datasheet": return "product_datasheet_viewed" as const;
    case "pricing": return "product_pricing_tab_viewed" as const;
    case "analogs":
    case "related": return "product_relations_tab_viewed" as const;
    case "analytics": return null;
  }
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const timestamps = values.flatMap((value) => value && Number.isFinite(Date.parse(value)) ? [Date.parse(value)] : []);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}
