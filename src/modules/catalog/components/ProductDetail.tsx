import Link from "next/link";
import type { ReactNode } from "react";

import type { FreshnessView } from "../../integration/freshness";
import type { ProductCommercialViewDto, RetailPriceHistoryDto } from "../../pricing-inventory";
import { buildCatalogHref, type CatalogProductDetailDto } from "../services";

import { ExpandableDescription } from "./ExpandableDescription";
import { ProductActions } from "./ProductActions";
import { ProductImageGallery } from "./ProductImageGallery";
import { ProductPricingBlock } from "./ProductPricingBlock";
import { RetailPriceHistoryChart } from "./RetailPriceHistoryChart";

export type ProductDetailTab =
  | "overview"
  | "description"
  | "characteristics"
  | "datasheet"
  | "pricing"
  | "relations";

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
  stockFreshness?: FreshnessView | null;
  userId?: string | null;
  hasAnalogs?: boolean;
  relationsContent?: ReactNode;
};

const TABS: Array<{ id: ProductDetailTab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "description", label: "Описание" },
  { id: "characteristics", label: "Характеристики" },
  { id: "datasheet", label: "Инструкции" },
  { id: "pricing", label: "Ценообразование" },
  { id: "relations", label: "Аналоги и сопутствующие" },
];

export function ProductDetail({ activeTab = "overview", canAddToOrder = false, canManagePurchasingLists = false, companyId = null, commercialView, hasAnalogs = false, initialFavorite = false, priceFreshness, product, relationsContent, retailPriceHistory, retailPriceHistoryError, stockFreshness, userId = null }: ProductDetailProps) {
  return <article className="space-y-4">
    <nav aria-label="Разделы товара" className="overflow-x-auto border-b border-zinc-200">
      <div className="flex min-w-max gap-6">
        {TABS.map((tab) => <Link aria-current={activeTab === tab.id ? "page" : undefined} className={`inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${activeTab === tab.id ? "border-emerald-600 text-emerald-800" : "border-transparent text-zinc-500 hover:text-zinc-900"}`} href={`?tab=${tab.id}`} key={tab.id} prefetch={false}>{tab.label}</Link>)}
      </div>
    </nav>
    {activeTab === "overview" ? (
      <>
        <ProductTabLayout product={product}><OverviewTab canAddToOrder={canAddToOrder} canManagePurchasingLists={canManagePurchasingLists} companyId={companyId} commercialView={commercialView} hasAnalogs={hasAnalogs} initialFavorite={initialFavorite} priceFreshness={priceFreshness} product={product} stockFreshness={stockFreshness} userId={userId} /></ProductTabLayout>
      </>
    ) : activeTab === "relations" ? <div className="min-w-0" data-testid="product-detail-content">{relationsContent}</div> : <ProductTabLayout product={product}>
      {activeTab === "description" ? <DescriptionTab product={product} /> : null}
      {activeTab === "characteristics" ? <CharacteristicsTab product={product} /> : null}
      {activeTab === "datasheet" ? <DatasheetTab product={product} /> : null}
      {activeTab === "pricing" ? <PricingHistoryTab error={retailPriceHistoryError} history={retailPriceHistory} productId={product.id} /> : null}
    </ProductTabLayout>}
  </article>;
}

function ProductTabLayout({ children, product }: { children: ReactNode; product: CatalogProductDetailDto }) {
  return <div className="grid gap-5 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:items-start lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-7" data-testid="product-detail-layout">
    <div data-testid="product-detail-image"><ProductImageGallery fallbackImageUrl={product.imageUrl} images={product.images} merchandisingLabels={product.merchandisingLabels} productId={product.id} productName={product.name} /></div>
    <div className="min-w-0" data-testid="product-detail-content">{children}</div>
  </div>;
}

function OverviewTab({ canAddToOrder, canManagePurchasingLists, companyId, commercialView, hasAnalogs, initialFavorite, priceFreshness, product, stockFreshness, userId }: Omit<ProductDetailProps, "activeTab" | "relationsContent">) {
  return <section aria-label="Обзор товара" data-testid="product-overview-tab">
      <h1 className="break-words text-3xl font-semibold text-zinc-950">{product.name}</h1>
      <p className="mt-1.5 text-sm font-medium text-zinc-600">Артикул: {product.sku}</p>
      {product.brand?.name ? <p className="mt-1.5 text-sm font-medium text-emerald-700">{product.brand.name}</p> : null}

      <section aria-label="Текущая коммерческая информация" className="mt-5">
        <ProductPricingBlock commercialView={commercialView} freshness={priceFreshness} variant="detail" />
      </section>
      <AvailabilityBlock commercialView={commercialView} freshness={stockFreshness} />
      <RelationPrompt hasAnalogs={hasAnalogs ?? false} stock={commercialView?.stock} />
      {companyId || canAddToOrder ? <ProductActions canAddToOrder={canAddToOrder ?? false} canManagePurchasingLists={canManagePurchasingLists} categoryId={product.category?.id ?? null} companyId={companyId ?? null} initialFavorite={initialFavorite} productId={product.id} userId={userId ?? null} /> : null}
  </section>;
}

function RelationPrompt({ hasAnalogs, stock }: { hasAnalogs: boolean; stock?: ProductCommercialViewDto["stock"] }) {
  if (!hasAnalogs) return null;
  const message = stock?.status === "low_stock"
    ? "Товар заканчивается на складе. Доступны аналоги."
    : stock?.status === "out_of_stock"
      ? "Товар временно недоступен. Выберите подходящий аналог."
      : stock?.status === "expected"
        ? "Товар ожидается к поступлению. Для срочной закупки доступны аналоги."
        : null;
  if (!message) return null;
  return (
    <aside className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4" data-testid="product-relations-prompt">
      <p className="text-sm text-amber-950">{message}</p>
      <Link className="mt-3 inline-flex min-h-11 items-center rounded-md border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600" href="?tab=relations" prefetch={false}>Посмотреть аналоги</Link>
    </aside>
  );
}

function DescriptionTab({ product }: { product: CatalogProductDetailDto }) {
  const description =
    product.description
    ?? product.shortDescription
    ?? "Описание товара пока не добавлено.";
  return (
    <section aria-label="Описание товара" data-testid="product-description-tab">
      <h1 className="text-xl font-semibold text-zinc-950">Описание товара</h1>
      <div className="mt-4 border-y border-zinc-200 py-5">
        <ExpandableDescription text={description} />
      </div>
    </section>
  );
}

function AvailabilityBlock({ commercialView, freshness }: { commercialView?: ProductCommercialViewDto; freshness?: FreshnessView | null }) {
  const stock = commercialView?.stock;
  const tone = getStockTone(stock?.status);
  return <section aria-label="Текущая доступность" className="mt-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold text-zinc-950">Наличие и поступления</h2><span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${tone.badge}`}>{stockStatusLabel(stock?.status)}</span></div>
    <div className={`mt-3 border p-4 ${tone.panel}`}>
      {stock ? <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <Metric label="Доступно" value={formatQuantity(stock.exactAvailableQuantity)} />
        <Metric label="Физический остаток" value={formatQuantity(stock.exactPhysicalQuantity)} />
        <Metric label="Ближайшее поступление" value={formatQuantity(stock.expectedArrival?.expectedQuantity ?? null)} />
        <Metric label="Дата поступления" value={stock.expectedArrival?.formattedExpectedDate ?? "Не подтверждена"} />
      </dl> : <p className="text-sm text-zinc-600">Данные о наличии пока недоступны.</p>}
      {freshness ? <p className="mt-4 text-xs text-zinc-500">{freshness.label}</p> : null}
    </div>
  </section>;
}

function CharacteristicsTab({ product }: { product: CatalogProductDetailDto }) {
  return <section aria-label="Технические характеристики"><h1 className="text-xl font-semibold text-zinc-950">Технические характеристики</h1>{product.keyCharacteristics.length ? <dl className="mt-3 divide-y divide-zinc-100 border-y border-zinc-200">{product.keyCharacteristics.map((item) => <div className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.3fr)] sm:gap-5" key={`${item.key ?? item.label}:${item.value}`}><dt className="text-zinc-500">{item.label}</dt><dd className="font-medium text-zinc-950">{isUsableFilter(item) ? <Link aria-label={`Показать товары: ${item.label} — ${item.value}`} className="rounded text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" href={buildCatalogHref({ attributeFilters: { [item.key!]: [item.filterValue ?? item.value] } })} prefetch={false}>{item.value}</Link> : item.value}</dd></div>)}</dl> : <p className="mt-3 text-sm text-zinc-600">Технические характеристики пока недоступны.</p>}</section>;
}

function isUsableFilter(item: CatalogProductDetailDto["keyCharacteristics"][number]): boolean {
  const filterValue = item.filterValue ?? item.value;
  return Boolean(item.isFilterable && item.key && /^property_[0-9a-f-]{36}$/.test(item.key) && filterValue.trim() && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(filterValue));
}

function DatasheetTab({ product }: { product: CatalogProductDetailDto }) {
  return <section aria-label="Инструкции и документы товара"><h1 className="text-xl font-semibold text-zinc-950">Инструкции</h1>{product.documents.length ? <ul className="mt-3 divide-y divide-zinc-100">{product.documents.map((document) => <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm" key={document.id}><div><p className="font-medium text-zinc-950">{document.title}</p><p className="text-zinc-500">{document.documentType}</p></div><a className="inline-flex min-h-11 items-center font-medium text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" href={document.url} rel="noopener noreferrer" target="_blank">Открыть документ</a></li>)}</ul> : <p className="mt-2 text-sm text-zinc-600">Инструкции для этого товара пока не опубликованы.</p>}</section>;
}

function PricingHistoryTab({ error, history, productId }: { error?: string | null; history?: RetailPriceHistoryDto | null; productId: string }) {
  if (error) return <section aria-label="История розничной цены"><h1 className="text-xl font-semibold text-zinc-950">История розничной цены</h1><div className="mt-3 border-y border-zinc-200 py-8 text-center"><p className="text-sm text-zinc-600">Не удалось загрузить историю цен. Текущая цена товара остаётся доступной.</p><p className="mt-2 text-xs text-zinc-500">{error}</p></div></section>;
  if (!history?.current) return <section aria-label="История розничной цены"><h1 className="text-xl font-semibold text-zinc-950">История розничной цены</h1><div className="mt-3 border-y border-zinc-200 py-8 text-center"><p className="text-sm text-zinc-600">История розничной цены пока недоступна.</p></div></section>;

  return <section aria-label="История розничной цены" className="space-y-5">
    <header>
      <h1 className="text-xl font-semibold text-zinc-950">История розничной цены</h1>
      <dl className="mt-3 grid gap-3 rounded-md border border-zinc-200 bg-white p-4 sm:grid-cols-3">
        <Metric label="Текущая цена" value={history.formattedCurrent ?? "Недоступна"} />
        <Metric label="Валюта" value={history.current.currency} />
        <Metric label="Действует с" value={formatHistoryDate(history.current.effectiveAt)} />
      </dl>
    </header>
    {history.mode === "baseline_only" ? <p className="rounded-md bg-zinc-50 p-4 text-sm text-zinc-600">История изменений накапливается. Сейчас доступна только текущая розничная цена.</p> : null}
    {history.mode === "accumulated" ? <p className="text-sm text-zinc-600">История формируется на основании зафиксированных изменений цены.</p> : null}
    {history.mode === "historical_verified" ? <p className="text-sm text-zinc-600">История сформирована по данным 1С.</p> : null}
    <RetailPriceHistoryChart history={history} productId={productId} />
    {history.points.length > 1 ? <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <HistoryMetric label="Текущая цена" value={history.formattedCurrent} />
      <HistoryMetric label="Предыдущая цена" value={history.formattedPrevious} />
      <HistoryMetric label="Изменение" value={[history.formattedAbsoluteChange, history.formattedPercentageChange].filter(Boolean).join(" · ") || null} />
      <HistoryMetric label="Минимум" value={history.formattedMinimum} />
      <HistoryMetric label="Максимум" value={history.formattedMaximum} />
    </dl> : null}
  </section>;
}

function HistoryMetric({ label, value }: { label: string; value: string | null }) {
  return <div className="rounded-md border border-zinc-200 bg-white p-3"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-zinc-950">{value ?? "Недоступно"}</dd></div>;
}

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-zinc-500">{label}</dt><dd className="mt-1 font-semibold text-zinc-950">{value}</dd></div>; }
function formatQuantity(value: number | null): string { return value === null ? "Уточняется" : `${value} шт.`; }
function stockStatusLabel(status: ProductCommercialViewDto["stock"] extends infer T ? T extends { status: infer S } ? S | undefined : undefined : undefined): string { switch (status) { case "in_stock": return "В наличии"; case "low_stock": return "Мало на складе"; case "out_of_stock": return "Нет в наличии"; case "expected": return "Ожидается к поступлению"; default: return "Наличие уточняется"; } }
function getStockTone(status: ProductCommercialViewDto["stock"] extends infer T ? T extends { status: infer S } ? S | undefined : undefined : undefined) { switch (status) { case "in_stock": return { panel: "border-emerald-100 bg-emerald-50", badge: "bg-emerald-100 text-emerald-800" }; case "low_stock": return { panel: "border-amber-100 bg-amber-50", badge: "bg-amber-100 text-amber-800" }; case "expected": return { panel: "border-sky-100 bg-sky-50", badge: "bg-sky-100 text-sky-800" }; case "out_of_stock": return { panel: "border-rose-100 bg-rose-50", badge: "bg-rose-100 text-rose-800" }; default: return { panel: "border-zinc-200 bg-zinc-50", badge: "bg-zinc-200 text-zinc-700" }; } }
