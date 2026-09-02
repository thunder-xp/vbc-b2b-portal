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
import { PartnerProductCompetitiveIntelligenceService } from "@/src/modules/competitive-intelligence";
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
  const trace = createPreviewTrace();
  const [resolvedParams, resolvedSearchParams, locale] = await Promise.all([
    params,
    searchParams,
    getPartnerLocale(),
  ]);
  const { slug } = resolvedParams;
  const copy = getCatalogCopy(locale);
  const activeTab = parseTab(resolvedSearchParams?.tab);
  trace.tab = activeTab;
  const returnTarget = parseCatalogReturnTarget(resolvedSearchParams?.returnTo);
  const identityResult = await tracePhase(trace, "route_identity", () =>
    getCatalogProductRouteIdentityAction(slug),
  );

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
  const productIdentity = identityResult.data;

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
    tracePhase(trace, "product_detail", () =>
      getCatalogProductDetailByIdAction(
        productIdentity.id,
        detailProjection(activeTab),
      ),
    ),
    needsCommercialContext
      ? tracePhase(trace, "commercial_views", () =>
          getProductCommercialViewsAction([productIdentity.id]))
      : Promise.resolve(null),
    tracePhase(trace, "workspace", () => getPartnerWorkspaceContextAction()),
    tracePhase(trace, "merchandising", () =>
      getProductMerchandisingLabelsAction(productIdentity.id)),
    activeTab === "pricing"
      ? tracePhase(trace, "retail_history", () =>
          getRetailPriceHistoryAction(productIdentity.id, "all"))
      : Promise.resolve(null),
    activeTab === "analogs" || activeTab === "related"
      ? tracePhase(trace, "relations", () =>
          getProductRelationSectionsAction(productIdentity.id))
      : Promise.resolve(null),
    activeTab === "overview"
      ? tracePhase(trace, "relation_summary", () =>
          getProductRelationSummaryAction(productIdentity.id))
      : Promise.resolve(null),
    activeTab === "overview"
      ? tracePhase(trace, "knowledge", () =>
          getProductKnowledgeAction(productIdentity.id))
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
      ? tracePhase(trace, "favorites", () => listFavoriteProductIdsAction([product.id]))
      : Promise.resolve(null),
    activeTab === "overview" && companyId && canViewCompetitiveIntelligence
      ? tracePhase(trace, "competitor_pricing", () => new CompetitorRetailPricingService()
          .getProductPricing(companyId, product.id, commercialView)
          .catch((error: unknown) => {
            console.error({
              event: "product_competitor_pricing_read_failed",
              errorType: error instanceof Error ? error.name : typeof error,
              productId: product.id,
            });
            return [];
          }))
      : Promise.resolve([]),
  ]);
  const initialFavorite = Boolean(
    favoriteResult?.success && favoriteResult.data.includes(product.id),
  );
  const competitorPricing = pricingResult;
  const competitiveIntelligence =
    activeTab === "analytics" && companyId && workspaceResult?.success &&
    canViewCompetitiveIntelligence
      ? await tracePhase(trace, "competitive_intelligence", () =>
          new PartnerProductCompetitiveIntelligenceService().getPartnerProduct(companyId, product.id))
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
  emitPreviewTrace(trace);

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

type PreviewTrace = {
  enabled: boolean;
  phases: Record<string, { duration: number; end: number; start: number }>;
  startedAt: number;
  tab: ProductDetailTab;
  traceId: string;
};

function createPreviewTrace(): PreviewTrace {
  return {
    enabled: process.env.VERCEL_ENV === "preview",
    phases: {},
    startedAt: performance.now(),
    tab: "overview",
    traceId: crypto.randomUUID(),
  };
}

async function tracePhase<T>(trace: PreviewTrace, name: string, work: () => Promise<T>): Promise<T> {
  if (!trace.enabled) return work();
  const startedAt = performance.now();
  try {
    return await work();
  } finally {
    const completedAt = performance.now();
    trace.phases[name] = {
      duration: Number((completedAt - startedAt).toFixed(1)),
      end: Number((completedAt - trace.startedAt).toFixed(1)),
      start: Number((startedAt - trace.startedAt).toFixed(1)),
    };
  }
}

function emitPreviewTrace(trace: PreviewTrace) {
  if (!trace.enabled) return;
  console.info(JSON.stringify({
    event: "pdp_flight_stream_trace",
    phases: trace.phases,
    routeReady: Number((performance.now() - trace.startedAt).toFixed(1)),
    tab: trace.tab,
    traceId: trace.traceId,
  }));
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
