"use client";

import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import type { FreshnessView } from "../../integration/freshness";
import type {
  ProductCommercialViewDto,
  RetailPriceHistoryDto,
} from "../../pricing-inventory";
import { buildCatalogHref, buildProductDetailTabHref, getCatalogCharacteristicFilterTarget, parseCatalogReturnTarget, type CatalogProductDetailDto } from "../services";

import { ExpandableDescription } from "./ExpandableDescription";
import { ProductDetailContextRail } from "./ProductDetailContextRail";
import { ProductPricingBlock } from "./ProductPricingBlock";
import { RetailPriceHistoryChart } from "./RetailPriceHistoryChart";
import { formatPartnerDate, getCatalogCopy, type PartnerLocale } from "../../partner-locale";
import { ProductCompetitorPricing } from "../../competitive-intelligence/components/ProductCompetitorPricing";
import type { ProductCompetitorPricingItem } from "../../competitive-intelligence/types";
import { isTransportedProductTab, type ProductTabTransportResponse } from "../contracts/product-tab-transport";

export type ProductDetailTab =
  | "overview"
  | "description"
  | "characteristics"
  | "datasheet"
  | "pricing"
  | "analytics"
  | "analogs"
  | "related";

type ProductDetailProps = {
  activeTab?: ProductDetailTab;
  canAddToOrder?: boolean;
  canManagePurchasingLists?: boolean;
  companyId?: string | null;
  commercialView?: ProductCommercialViewDto;
  priceFreshness?: FreshnessView | null;
  retailPriceHistory?: RetailPriceHistoryDto | null;
  retailPriceHistoryError?: string | null;
  initialFavorite?: boolean;
  product: CatalogProductDetailDto;
  returnTarget?: string;
  stockFreshness?: FreshnessView | null;
  userId?: string | null;
  hasAnalogs?: boolean;
  relationsContent?: ReactNode;
  analyticsContent?: ReactNode;
  locale?: PartnerLocale;
  competitorPricing?: ProductCompetitorPricingItem[];
  showAnalyticsTab?: boolean;
};

export function ProductDetail({
  activeTab: initialActiveTab = "overview",
  canAddToOrder = false,
  canManagePurchasingLists = false,
  companyId = null,
  commercialView,
  hasAnalogs = false,
  initialFavorite = false,
  locale = "ru",
  competitorPricing = [],
  priceFreshness,
  product,
  returnTarget = "/cabinet/catalog",
  relationsContent,
  analyticsContent,
  retailPriceHistory,
  retailPriceHistoryError,
  stockFreshness,
  showAnalyticsTab = false,
  userId = null,
}: ProductDetailProps) {
  const [activeTab, setActiveTab] = useState<ProductDetailTab>(initialActiveTab);
  const [tabProduct, setTabProduct] = useState(product);
  const [history, setHistory] = useState(retailPriceHistory);
  const [historyError, setHistoryError] = useState(retailPriceHistoryError);
  const [pendingTab, setPendingTab] = useState<ProductDetailTab | null>(null);
  const [transportError, setTransportError] = useState(false);
  const previousServerProps = useRef({ initialActiveTab, product, retailPriceHistory, retailPriceHistoryError });
  const requestGeneration = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const copy = getCatalogCopy(locale);
  const catalogReturnTarget = parseCatalogReturnTarget(returnTarget);
  const tabs: Array<{ id: ProductDetailTab; label: string }> = [
    { id: "overview", label: copy.overview },
    { id: "description", label: copy.description },
    { id: "characteristics", label: copy.characteristics },
    { id: "datasheet", label: copy.instructions },
    { id: "pricing", label: copy.pricing },
    ...(showAnalyticsTab ? [{ id: "analytics" as const, label: locale === "ro" ? "Analiză" : "Аналитика" }] : []),
    { id: "analogs", label: copy.analogs },
    { id: "related", label: copy.related },
  ];

  if (
    previousServerProps.current.initialActiveTab !== initialActiveTab ||
    previousServerProps.current.product !== product ||
    previousServerProps.current.retailPriceHistory !== retailPriceHistory ||
    previousServerProps.current.retailPriceHistoryError !== retailPriceHistoryError
  ) {
    previousServerProps.current = { initialActiveTab, product, retailPriceHistory, retailPriceHistoryError };
    setActiveTab(initialActiveTab);
    setTabProduct(product);
    setHistory(retailPriceHistory);
    setHistoryError(retailPriceHistoryError);
  }

  useEffect(() => {
    const onPopState = () => {
      const requested = new URL(window.location.href).searchParams.get("tab");
      const tab = requested === "relations" ? "analogs" : requested ?? "overview";
      if (isTransportedProductTab(tab)) void loadTransportedTab(tab, false);
      else window.location.reload();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      abortController.current?.abort();
    };
  });

  async function loadTransportedTab(tab: ProductDetailTab, pushHistory: boolean) {
    if (!isTransportedProductTab(tab)) return;
    const generation = ++requestGeneration.current;
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    setPendingTab(tab);
    setTransportError(false);
    try {
      const response = await fetch(`/api/cabinet/catalog/${encodeURIComponent(product.id)}/tab?tab=${tab}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("TAB_TRANSPORT_FAILED");
      const payload = await response.json() as ProductTabTransportResponse;
      if (generation !== requestGeneration.current) return;
      if ("product" in payload.data) setTabProduct(payload.data.product);
      if (payload.data.tab === "pricing") {
        setHistory(payload.data.history);
        setHistoryError(payload.data.error);
      }
      setActiveTab(tab);
      if (pushHistory) window.history.pushState({ productTab: tab }, "", buildProductDetailTabHref(tab, catalogReturnTarget));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (generation === requestGeneration.current) setTransportError(true);
    } finally {
      if (generation === requestGeneration.current) setPendingTab(null);
    }
  }

  function onTabClick(event: MouseEvent<HTMLAnchorElement>, tab: ProductDetailTab) {
    if (!isTransportedProductTab(tab) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    void loadTransportedTab(tab, true);
  }
  return (
    <article className="space-y-4">
      <nav
        aria-label={copy.productSections}
        className="overflow-x-auto border-b border-zinc-200"
      >
        <div className="flex min-w-max gap-6">
          <Link
            className="inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-1 text-sm font-semibold text-zinc-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            href={catalogReturnTarget}
            prefetch={false}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {copy.backTab}
          </Link>
          {tabs.map((tab) => (
            <Link
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={`inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${activeTab === tab.id ? "border-emerald-600 text-emerald-800" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
              href={buildProductDetailTabHref(tab.id, catalogReturnTarget)}
              key={tab.id}
              onClick={(event) => onTabClick(event, tab.id)}
              prefetch={false}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>
      {activeTab === "analogs" || activeTab === "related" ? (
        <div className="min-w-0" data-testid="product-detail-content">
          {relationsContent}
        </div>
      ) : (
        <ProductTabLayout
          canAddToOrder={canAddToOrder}
          canManagePurchasingLists={canManagePurchasingLists}
          companyId={companyId}
          initialFavorite={initialFavorite}
          locale={locale}
          product={product}
          userId={userId}
        >
          {pendingTab ? <div aria-live="polite" className="mb-3 h-1 overflow-hidden rounded bg-zinc-100" role="status"><div className="h-full w-1/2 animate-pulse bg-emerald-500" /><span className="sr-only">{copy.loading}</span></div> : null}
          {transportError ? <p className="mb-3 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{copy.unavailableMessage}</p> : null}
          {activeTab === "overview" ? (
          <OverviewTab
            commercialView={commercialView}
            competitorPricing={competitorPricing}
            hasAnalogs={hasAnalogs}
            locale={locale}
            priceFreshness={priceFreshness}
            returnTarget={catalogReturnTarget}
            stockFreshness={stockFreshness}
          />
        ) : activeTab === "analytics" ? (
          analyticsContent
        ) : (
          <>
          {activeTab === "description" ? (
            <DescriptionTab locale={locale} product={tabProduct} />
          ) : null}
          {activeTab === "characteristics" ? (
            <CharacteristicsTab locale={locale} product={tabProduct} />
          ) : null}
          {activeTab === "datasheet" ? (
            <DatasheetTab locale={locale} product={tabProduct} />
          ) : null}
          {activeTab === "pricing" ? (
            <PricingHistoryTab
              error={historyError}
              history={history}
              locale={locale}
              productId={product.id}
            />
          ) : null}
          </>
        )}
        </ProductTabLayout>
      )}
    </article>
  );
}

function ProductTabLayout({
  canAddToOrder,
  canManagePurchasingLists,
  children,
  companyId,
  initialFavorite,
  locale,
  product,
  userId,
}: {
  canAddToOrder: boolean;
  canManagePurchasingLists: boolean;
  children: ReactNode;
  companyId: string | null;
  initialFavorite: boolean;
  locale: PartnerLocale;
  product: CatalogProductDetailDto;
  userId: string | null;
}) {
  return (
    <div
      className="grid gap-4 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] md:items-start lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-5"
      data-testid="product-detail-layout"
    >
      <ProductDetailContextRail
        canAddToOrder={canAddToOrder}
        canManagePurchasingLists={canManagePurchasingLists}
        companyId={companyId}
        initialFavorite={initialFavorite}
        locale={locale}
        product={product}
        userId={userId}
      />
      <div className="min-w-0" data-testid="product-detail-content">
        {children}
      </div>
    </div>
  );
}

function OverviewTab({
  commercialView,
  hasAnalogs,
  locale = "ru",
  priceFreshness,
  returnTarget = "/cabinet/catalog",
  stockFreshness,
  competitorPricing = [],
}: Pick<ProductDetailProps, "commercialView" | "hasAnalogs" | "locale" | "priceFreshness" | "returnTarget" | "stockFreshness" | "competitorPricing">) {
  const copy = getCatalogCopy(locale);
  return (
    <section
      aria-label={copy.productOverview}
      data-testid="product-overview-tab"
    >
      <section aria-label={copy.currentCommercial}>
        <ProductPricingBlock
          commercialView={commercialView}
          freshness={priceFreshness}
          locale={locale}
          variant="detail"
        />
      </section>
      <AvailabilityBlock
        commercialView={commercialView}
        freshness={stockFreshness}
        locale={locale}
      />
      <ProductCompetitorPricing analyticsHref={buildProductDetailTabHref("analytics", returnTarget)} items={competitorPricing} locale={locale} />
      <RelationPrompt
        hasAnalogs={hasAnalogs ?? false}
        locale={locale}
        relationsHref={buildProductDetailTabHref("analogs", returnTarget)}
        stock={commercialView?.stock}
      />
    </section>
  );
}

function RelationPrompt({
  hasAnalogs,
  locale,
  relationsHref,
  stock,
}: {
  hasAnalogs: boolean;
  locale: PartnerLocale;
  relationsHref: string;
  stock?: ProductCommercialViewDto["stock"];
}) {
  const copy = getCatalogCopy(locale);
  if (!hasAnalogs) return null;
  const message =
    stock?.status === "low_stock"
      ? copy.lowStockAnalogs
      : stock?.status === "out_of_stock"
        ? copy.outOfStockAnalogs
        : stock?.status === "expected"
          ? copy.expectedAnalogs
          : null;
  if (!message) return null;
  return (
    <aside
      className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4"
      data-testid="product-relations-prompt"
    >
      <p className="text-sm text-amber-950">{message}</p>
      <Link
        className="mt-3 inline-flex min-h-11 items-center rounded-md border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
        href={relationsHref}
        prefetch={false}
      >
        {copy.viewAnalogs}
      </Link>
    </aside>
  );
}

function DescriptionTab({
  locale,
  product,
}: {
  locale: PartnerLocale;
  product: CatalogProductDetailDto;
}) {
  const copy = getCatalogCopy(locale);
  const description =
    product.description ?? product.shortDescription ?? copy.descriptionEmpty;
  return (
    <section
      aria-label={copy.productDescription}
      data-testid="product-description-tab"
    >
      <ExpandableDescription text={description} />
    </section>
  );
}

function AvailabilityBlock({
  commercialView,
  locale,
}: {
  commercialView?: ProductCommercialViewDto;
  freshness?: FreshnessView | null;
  locale: PartnerLocale;
}) {
  const copy = getCatalogCopy(locale);
  const stock = commercialView?.stock;
  const tone = getStockTone(stock?.status);
  return (
    <section aria-label={copy.currentAvailability} className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold leading-6 text-zinc-950">
          {copy.stockAndArrivals}
        </h2>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${tone.badge}`}
        >
          {stockStatusLabel(stock?.status, locale)}
        </span>
      </div>
      <div className={`mt-2 border p-3 ${tone.panel}`}>
        {stock ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Metric
              label={copy.available}
              value={formatQuantity(stock.exactAvailableQuantity, locale)}
            />
            <Metric
              label={copy.physicalStock}
              value={formatQuantity(stock.exactPhysicalQuantity, locale)}
            />
            <Metric
              label={copy.nearestArrival}
              value={formatQuantity(
                stock.expectedArrival?.expectedQuantity ?? null,
                locale,
              )}
            />
            <Metric
              label={copy.arrivalDate}
              value={
                stock.expectedArrival?.expectedDate
                  ? formatPartnerDate(stock.expectedArrival.expectedDate, locale, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })
                  : copy.notConfirmed
              }
            />
          </dl>
        ) : (
          <p className="text-sm text-zinc-600">{copy.stockUnavailable}</p>
        )}
      </div>
    </section>
  );
}
function CharacteristicsTab({
  locale,
  product,
}: {
  locale: PartnerLocale;
  product: CatalogProductDetailDto;
}) {
  const copy = getCatalogCopy(locale);
  return (
    <section aria-label={copy.technicalCharacteristics}>
      {product.keyCharacteristics.length ? (
        <dl className="divide-y divide-zinc-100">
          {product.keyCharacteristics.map((item) => (
            <div
              className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.3fr)] sm:gap-5"
              key={`${item.key ?? item.label}:${item.value}`}
            >
              <dt className="text-zinc-500">{item.label}</dt>
              <dd className="font-medium text-zinc-950">
                {getCatalogCharacteristicFilterTarget(item) ? (
                  <Link
                    aria-label={`${copy.showProducts}: ${item.label} — ${item.value}`}
                    className="rounded text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                    href={buildCatalogHref({
                      attributeFilters: {
                        [item.key!]: [item.filterValue ?? item.value],
                      },
                    })}
                    prefetch={false}
                  >
                    {item.value}
                  </Link>
                ) : (
                  item.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-zinc-600">
          {copy.characteristicsUnavailable}
        </p>
      )}
    </section>
  );
}

function DatasheetTab({
  locale,
  product,
}: {
  locale: PartnerLocale;
  product: CatalogProductDetailDto;
}) {
  const copy = getCatalogCopy(locale);
  return (
    <section aria-label={copy.productDocuments}>
      {product.documents.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {product.documents.map((document) => (
            <li
              className="flex min-h-64 min-w-0 flex-col overflow-hidden rounded-md border border-zinc-200 bg-white text-sm md:h-[255px] lg:h-[285px]"
              data-testid="document-preview-card"
              key={document.id}
            >
              <div aria-hidden="true" className="flex min-h-40 flex-1 items-center justify-center bg-zinc-50 p-5">
                <span className="relative flex h-28 w-24 flex-col items-center justify-center border border-zinc-300 bg-white text-zinc-400 shadow-sm">
                  <FileText className="size-9" />
                  <span className="absolute inset-x-2 bottom-3 border-t border-zinc-200 pt-1 text-center text-[10px] font-semibold tracking-[0.12em] text-zinc-500">DATASHEET</span>
                </span>
              </div>
              <a
                className="m-3 inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                href={document.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {copy.openDocument}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-600">
          {copy.instructionsUnavailable}
        </p>
      )}
    </section>
  );
}

function PricingHistoryTab({
  error,
  history,
  locale,
  productId,
}: {
  error?: string | null;
  history?: RetailPriceHistoryDto | null;
  locale: PartnerLocale;
  productId: string;
}) {
  const copy = getCatalogCopy(locale);
  if (error)
    return (
      <section aria-label={copy.retailHistory}>
        <div className="border-y border-zinc-200 py-8 text-center">
          <p className="text-sm text-zinc-600">{copy.historyLoadError}</p>
          <p className="mt-2 text-xs text-zinc-500">{error}</p>
        </div>
      </section>
    );
  if (!history?.current)
    return (
      <section aria-label={copy.retailHistory}>
        <div className="border-y border-zinc-200 py-8 text-center">
          <p className="text-sm text-zinc-600">{copy.historyUnavailable}</p>
        </div>
      </section>
    );

  return (
    <section aria-label={copy.retailHistory} className="space-y-5">
      <dl
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        data-testid="price-history-metrics"
      >
          <HistoryMetric
            label={copy.currentPrice}
            value={history.formattedCurrent}
          />
          <HistoryMetric
            label={copy.previousPrice}
            value={history.formattedPrevious}
          />
          <HistoryMetric
            label={copy.change}
            value={
              [
                history.formattedAbsoluteChange,
                history.formattedPercentageChange,
              ]
                .filter(Boolean)
                .join(" · ") || null
            }
          />
          <HistoryMetric
            label={copy.minimum}
            value={history.formattedMinimum}
            unavailable={copy.unavailable}
          />
          <HistoryMetric
            label={copy.maximum}
            value={history.formattedMaximum}
            unavailable={copy.unavailable}
          />
      </dl>
      <RetailPriceHistoryChart history={history} productId={productId} />
    </section>
  );
}

function HistoryMetric({
  label,
  unavailable = "Недоступно",
  value,
}: {
  label: string;
  unavailable?: string;
  value: string | null;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-zinc-950">
        {value ?? unavailable}
      </dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}
function formatQuantity(value: number | null, locale: PartnerLocale): string {
  return value === null
    ? getCatalogCopy(locale).pending
    : `${value} ${locale === "ro" ? "buc." : "шт."}`;
}
function stockStatusLabel(
  status: ProductCommercialViewDto["stock"] extends infer T
    ? T extends { status: infer S }
      ? S | undefined
      : undefined
    : undefined,
  locale: PartnerLocale,
): string {
  const copy = getCatalogCopy(locale);
  switch (status) {
    case "in_stock":
      return copy.inStock;
    case "low_stock":
      return copy.lowStock;
    case "out_of_stock":
      return copy.outOfStock;
    case "expected":
      return copy.expected;
    default:
      return copy.availabilityPending;
  }
}
function getStockTone(
  status: ProductCommercialViewDto["stock"] extends infer T
    ? T extends { status: infer S }
      ? S | undefined
      : undefined
    : undefined,
) {
  switch (status) {
    case "in_stock":
      return {
        panel: "border-emerald-100 bg-emerald-50",
        badge: "bg-emerald-100 text-emerald-800",
      };
    case "low_stock":
      return {
        panel: "border-amber-100 bg-amber-50",
        badge: "bg-amber-100 text-amber-800",
      };
    case "expected":
      return {
        panel: "border-sky-100 bg-sky-50",
        badge: "bg-sky-100 text-sky-800",
      };
    case "out_of_stock":
      return {
        panel: "border-rose-100 bg-rose-50",
        badge: "bg-rose-100 text-rose-800",
      };
    default:
      return {
        panel: "border-zinc-200 bg-zinc-50",
        badge: "bg-zinc-200 text-zinc-700",
      };
  }
}
