import { notFound } from "next/navigation";

import {
  getCatalogProductDetailByIdAction,
  getCatalogProductRouteIdentityAction,
} from "@/src/modules/catalog/actions/product-page.action";
import { getProductMerchandisingLabelsAction } from "@/src/modules/catalog/actions";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import {
  ProductDetail,
  type ProductDetailTab,
} from "@/src/modules/catalog/components/ProductDetail";
import { parseCatalogReturnTarget } from "@/src/modules/catalog/services";
import { evaluateFreshness } from "@/src/modules/integration/freshness";
import {
  getProductCommercialViewsAction,
  getRetailPriceHistoryAction,
} from "@/src/modules/pricing-inventory/actions";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { listFavoriteProductIdsAction } from "@/src/modules/purchasing-lists/actions";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import {
  getProductRelationSectionsAction,
  getProductRelationSummaryAction,
  ProductRelationSectionsView,
} from "@/src/modules/product-relations";
import { getProductKnowledgeAction } from "@/src/modules/knowledge-base/actions";
import { KnowledgeCardView } from "@/src/modules/knowledge-base/landing-components";
import { getCatalogCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { CompetitiveIntelligenceRepository } from "@/src/modules/competitive-intelligence";
import { ProductCompetitiveIntelligence } from "@/src/modules/competitive-intelligence/components";
import { CompetitorRetailPricingService } from "@/src/modules/competitive-intelligence/retail-pricing.service";

type ProductDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    tab?: string | string[];
    returnTo?: string | string[];
  }>;
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: ProductDetailPageProps) {
  const [resolvedParams, resolvedSearchParams, locale] = await Promise.all([
    params,
    searchParams,
    getPartnerLocale(),
  ]);
  const { slug } = resolvedParams;
  const copy = getCatalogCopy(locale);
  const activeTab = parseTab(resolvedSearchParams?.tab);
  const returnTarget = parseCatalogReturnTarget(resolvedSearchParams?.returnTo);
  const identityResult = await getCatalogProductRouteIdentityAction(slug);

  if (!identityResult.success) {
    return (
      <EmptyCatalog
        message={identityResult.message}
        title={copy.productUnavailable}
      />
    );
  }

  if (!identityResult.data) {
    notFound();
  }

  const needsCommercialContext =
    activeTab === "overview" || activeTab === "analogs" || activeTab === "related";
  const [
    productResult,
    commercialViewsResult,
    workspaceResult,
    merchandisingResult,
    retailHistoryResult,
    relationResult,
    relationSummaryResult,
    knowledgeResult,
  ] = await Promise.all([
    getCatalogProductDetailByIdAction(
      identityResult.data.id,
      detailProjection(activeTab),
    ),
    needsCommercialContext
      ? getProductCommercialViewsAction([identityResult.data.id])
      : Promise.resolve(null),
    getPartnerWorkspaceContextAction(),
    getProductMerchandisingLabelsAction(identityResult.data.id),
    activeTab === "pricing"
      ? getRetailPriceHistoryAction(identityResult.data.id, "all")
      : Promise.resolve(null),
    activeTab === "analogs" || activeTab === "related"
      ? getProductRelationSectionsAction(identityResult.data.id)
      : Promise.resolve(null),
    activeTab === "overview"
      ? getProductRelationSummaryAction(identityResult.data.id)
      : Promise.resolve(null),
    activeTab === "overview"
      ? getProductKnowledgeAction(identityResult.data.id)
      : Promise.resolve(null),
  ]);

  if (!productResult.success)
    return (
      <EmptyCatalog
        message={productResult.message}
        title={copy.productUnavailable}
      />
    );
  if (!productResult.data) notFound();
  const product = productResult.data;

  const commercialView = commercialViewsResult?.success
    ? commercialViewsResult.data[0]
    : undefined;
  const canAddToOrder = Boolean(
    workspaceResult.success &&
    workspaceResult.data.capabilities.productCard.canAddToOrder,
  );
  const canManagePurchasingLists = Boolean(
    workspaceResult.success &&
    workspaceResult.data.capabilities.productCard.canManagePurchasingLists,
  );
  const companyId = workspaceResult.success ? workspaceResult.data.companyId : null;
  const userId = workspaceResult.success ? workspaceResult.data.userId : null;
  const canViewCompetitiveIntelligence = Boolean(
    workspaceResult.success &&
    workspaceResult.data.capabilities.canViewCompetitiveIntelligence,
  );
  const [favoriteResult, pricingResult] = await Promise.all([
    activeTab !== "analogs" && activeTab !== "related" && canManagePurchasingLists
      ? listFavoriteProductIdsAction([product.id])
      : Promise.resolve(null),
    activeTab === "overview" && companyId && canViewCompetitiveIntelligence
      ? new CompetitorRetailPricingService()
          .getProductPricing(companyId, product.id, commercialView)
          .catch((error: unknown) => {
            console.error({
              event: "product_competitor_pricing_read_failed",
              errorType: error instanceof Error ? error.name : typeof error,
              productId: product.id,
            });
            return [];
          })
      : Promise.resolve([]),
  ]);
  const initialFavorite = Boolean(
    favoriteResult?.success && favoriteResult.data.includes(product.id),
  );
  const competitorPricing = pricingResult;
  const competitiveIntelligence =
    activeTab === "analytics" && companyId && workspaceResult?.success &&
    canViewCompetitiveIntelligence
      ? await new CompetitiveIntelligenceRepository().getPartnerProduct(companyId, productResult.data.id)
      : null;
  const priceUpdatedAt = latestTimestamp([
    commercialView?.partnerPrice?.lastUpdatedAt,
    commercialView?.retailPrice?.lastUpdatedAt,
  ]);
  const priceFreshness = priceUpdatedAt
    ? evaluateFreshness(priceUpdatedAt, "price", "Цены")
    : null;
  const stockFreshness = commercialView?.stock?.lastUpdatedAt
    ? evaluateFreshness(commercialView.stock.lastUpdatedAt, "stock", "Остатки")
    : null;

  return (
    <>
      <BehaviorViewEvent
        brandId={productResult.data.brand?.id}
        categoryId={productResult.data.category?.id}
        dedupeKey={`product:${productResult.data.id}`}
        eventName="product_viewed"
        productId={productResult.data.id}
        route={`/cabinet/catalog/${productResult.data.slug}`}
        sourceSurface="product_detail"
      />
      {activeTab === "overview" &&
      knowledgeResult?.success &&
      knowledgeResult.data.length ? (
        <section className="mx-auto max-w-7xl px-4 pb-10">
          <h2 className="text-lg font-semibold">{copy.usefulMaterials}</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {knowledgeResult.data.map((article) => (
              <KnowledgeCardView article={article} key={article.id} />
            ))}
          </div>
        </section>
      ) : null}
      <ProductDetail
        activeTab={activeTab}
        canAddToOrder={canAddToOrder}
        canManagePurchasingLists={canManagePurchasingLists}
        companyId={companyId}
        commercialView={commercialView}
        priceFreshness={priceFreshness}
        initialFavorite={initialFavorite}
        locale={locale}
        hasAnalogs={
          activeTab === "overview" && relationSummaryResult?.success
            ? relationSummaryResult.data.hasAnalogs
            : false
        }
        relationsContent={
          (activeTab === "analogs" || activeTab === "related") &&
          relationResult?.success &&
          workspaceResult?.success ? (
            <ProductRelationSectionsView
              capabilities={workspaceResult.data.capabilities.productCard}
              companyId={companyId}
              locale={locale}
              sections={relationResult.data}
              type={activeTab === "analogs" ? "analog" : "related"}
              sourceProductId={productResult.data.id}
              sourceSlug={productResult.data.slug}
              sourceStock={commercialView?.stock}
              userId={userId}
            />
          ) : activeTab === "analogs" || activeTab === "related" ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
              {copy.relationsLoadError}
            </p>
          ) : null
        }
        analyticsContent={
          activeTab === "analytics" && competitiveIntelligence ? (
            <ProductCompetitiveIntelligence
              data={competitiveIntelligence}
              locale={locale}
              productId={productResult.data.id}
            />
          ) : activeTab === "analytics" ? (
            <p className="border-y border-zinc-200 py-8 text-center text-sm text-zinc-600">
              {locale === "ro" ? "Analiza competitivă nu este disponibilă." : "Конкурентная аналитика недоступна."}
            </p>
          ) : null
        }
        product={{
          ...productResult.data,
          merchandisingLabels: merchandisingResult.success
            ? merchandisingResult.data
            : [],
        }}
        retailPriceHistory={
          retailHistoryResult?.success ? retailHistoryResult.data : null
        }
        retailPriceHistoryError={
          retailHistoryResult && !retailHistoryResult.success
            ? retailHistoryResult.message
            : null
        }
        returnTarget={returnTarget}
        stockFreshness={stockFreshness}
        showAnalyticsTab={canViewCompetitiveIntelligence}
        userId={userId}
        competitorPricing={competitorPricing}
      />
      {tabViewEvent(activeTab) ? (
        <BehaviorViewEvent
          dedupeKey={`product-tab:${activeTab}:${productResult.data.id}`}
          eventName={tabViewEvent(activeTab)!}
          productId={productResult.data.id}
          route={`/cabinet/catalog/${productResult.data.slug}?tab=${activeTab}`}
          sourceSurface={`product_${activeTab}_tab`}
        />
      ) : null}
    </>
  );
}

function parseTab(value: string | string[] | undefined): ProductDetailTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "description" ||
    tab === "characteristics" ||
    tab === "datasheet" ||
    tab === "pricing" ||
    tab === "analytics" ||
    tab === "analogs" ||
    tab === "related"
    ? tab
    : tab === "relations"
      ? "analogs"
    : "overview";
}

function detailProjection(tab: ProductDetailTab) {
  return {
    includeAttributes:
      tab === "overview" || tab === "characteristics" || tab === "datasheet",
    includeDocuments: tab === "datasheet",
    includeImages: tab === "overview" || tab === "analytics",
  };
}

function tabViewEvent(tab: ProductDetailTab) {
  switch (tab) {
    case "overview":
      return "product_overview_viewed" as const;
    case "description":
      return "product_description_viewed" as const;
    case "characteristics":
      return "product_characteristics_viewed" as const;
    case "datasheet":
      return "product_datasheet_viewed" as const;
    case "pricing":
      return "product_pricing_tab_viewed" as const;
    case "analogs":
    case "related":
      return "product_relations_tab_viewed" as const;
    case "analytics":
      return null;
  }
}

function latestTimestamp(
  values: Array<string | null | undefined>,
): string | null {
  const timestamps = values.flatMap((value) =>
    value && Number.isFinite(Date.parse(value)) ? [Date.parse(value)] : [],
  );
  return timestamps.length
    ? new Date(Math.max(...timestamps)).toISOString()
    : null;
}
