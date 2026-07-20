import Link from "next/link";

import type { FreshnessView } from "../../integration/freshness";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { buildCatalogHref, type CatalogProductDetailDto } from "../services";

import { ExpandableDescription } from "./ExpandableDescription";
import { ProductActions } from "./ProductActions";
import { ProductImageGallery } from "./ProductImageGallery";
import { ProductPricingBlock } from "./ProductPricingBlock";

export type ProductDetailTab = "description" | "characteristics" | "datasheet" | "pricing";

type ProductDetailProps = {
  activeTab?: ProductDetailTab;
  canAddToOrder?: boolean;
  canManagePurchasingLists?: boolean;
  companyId?: string | null;
  commercialView?: ProductCommercialViewDto;
  priceFreshness?: FreshnessView | null;
  product: CatalogProductDetailDto;
  stockFreshness?: FreshnessView | null;
  userId?: string | null;
};

const TABS: Array<{ id: ProductDetailTab; label: string }> = [
  { id: "description", label: "Описание" },
  { id: "characteristics", label: "Характеристики" },
  { id: "datasheet", label: "Datasheet" },
  { id: "pricing", label: "Ценообразование" },
];

export function ProductDetail({ activeTab = "description", canAddToOrder = false, canManagePurchasingLists = false, companyId = null, commercialView, priceFreshness, product, stockFreshness, userId = null }: ProductDetailProps) {
  return <article className="space-y-4">
    <nav aria-label="Разделы товара" className="overflow-x-auto border-b border-zinc-200">
      <div className="flex min-w-max gap-6">
        {TABS.map((tab) => <Link aria-current={activeTab === tab.id ? "page" : undefined} className={`border-b-2 px-1 pb-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${activeTab === tab.id ? "border-emerald-600 text-emerald-800" : "border-transparent text-zinc-500 hover:text-zinc-900"}`} href={`?tab=${tab.id}`} key={tab.id} prefetch={false}>{tab.label}</Link>)}
      </div>
    </nav>
    <div className="grid gap-5 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:items-start lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-7" data-testid="product-detail-layout">
      <div data-testid="product-detail-image"><ProductImageGallery fallbackImageUrl={product.imageUrl} images={product.images} productId={product.id} productName={product.name} /></div>
      <div className="min-w-0" data-testid="product-detail-content">
        {activeTab === "description" ? <DescriptionTab canAddToOrder={canAddToOrder} canManagePurchasingLists={canManagePurchasingLists} companyId={companyId} commercialView={commercialView} priceFreshness={priceFreshness} product={product} stockFreshness={stockFreshness} userId={userId} /> : null}
        {activeTab === "characteristics" ? <CharacteristicsTab product={product} /> : null}
        {activeTab === "datasheet" ? <DatasheetTab product={product} /> : null}
        {activeTab === "pricing" ? <PricingHistoryTab /> : null}
      </div>
    </div>
  </article>;
}

function DescriptionTab({ canAddToOrder, canManagePurchasingLists, companyId, commercialView, priceFreshness, product, stockFreshness, userId }: Omit<ProductDetailProps, "activeTab">) {
  const description = product.description ?? product.shortDescription ?? "Описание товара пока недоступно.";
  return <section aria-label="Описание товара" data-testid="product-description-tab">
      <h1 className="text-3xl font-semibold text-zinc-950">{product.name}</h1>
      <p className="mt-1.5 text-sm font-medium text-zinc-600">Артикул: {product.sku}</p>
      {product.brand?.name ? <p className="mt-1.5 text-sm font-medium text-emerald-700">{product.brand.name}</p> : null}
      <ExpandableDescription text={description} />
      {companyId || canAddToOrder ? <ProductActions canAddToOrder={canAddToOrder ?? false} canManagePurchasingLists={canManagePurchasingLists} categoryId={product.category?.id ?? null} companyId={companyId ?? null} productId={product.id} slug={product.slug} userId={userId ?? null} /> : null}

      <section aria-label="Текущая коммерческая информация" className="mt-8 border-t border-zinc-200 pt-6">
        <h2 className="text-base font-semibold text-zinc-950">Коммерческое предложение</h2>
        <div className="mt-3"><ProductPricingBlock commercialView={commercialView} freshness={priceFreshness} variant="detail" /></div>
      </section>
      <AvailabilityBlock commercialView={commercialView} freshness={stockFreshness} />
  </section>;
}

function AvailabilityBlock({ commercialView, freshness }: { commercialView?: ProductCommercialViewDto; freshness?: FreshnessView | null }) {
  const stock = commercialView?.stock;
  const tone = getStockTone(stock?.status);
  return <section aria-label="Текущая доступность" className="mt-6 border-t border-zinc-200 pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold text-zinc-950">Наличие и поступления</h2><span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${tone.badge}`}>{stockStatusLabel(stock?.status)}</span></div>
    <div className={`mt-3 border p-4 ${tone.panel}`}>
      {stock ? <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <Metric label="Доступно" value={formatQuantity(stock.exactAvailableQuantity)} />
        <Metric label="Физический остаток" value={formatQuantity(stock.exactPhysicalQuantity)} />
        <Metric label="Ближайшее поступление" value={formatQuantity(stock.expectedArrival?.expectedQuantity ?? null)} />
        <Metric label="Дата поступления" value={stock.expectedArrival?.formattedExpectedDate ?? "Не подтверждена"} />
      </dl> : <p className="text-sm text-zinc-600">Данные о наличии пока недоступны.</p>}
      {freshness ? <p className="mt-4 text-xs text-zinc-500">{freshness.label}</p> : null}
      {freshness?.staleNotice ? <p className="mt-1 text-xs text-amber-700">{freshness.staleNotice}</p> : null}
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
  return <section aria-label="Документы товара"><h1 className="text-xl font-semibold text-zinc-950">Документы</h1>{product.documents.length ? <ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">{product.documents.map((document) => <li className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm" key={document.id}><div><p className="font-medium text-zinc-950">{document.title}</p><p className="text-zinc-500">{document.documentType}</p></div><a className="font-medium text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" href={document.url} rel="noopener noreferrer" target="_blank">Открыть документ</a></li>)}</ul> : <p className="mt-3 border-y border-zinc-200 py-8 text-sm text-zinc-600">Документы товара пока недоступны.</p>}</section>;
}

function PricingHistoryTab() {
  return <section aria-label="История цен"><h1 className="text-xl font-semibold text-zinc-950">История цен</h1><div className="mt-3 border-y border-zinc-200 py-8 text-center"><p className="text-sm text-zinc-600">История изменения цен пока недоступна</p></div></section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-zinc-500">{label}</dt><dd className="mt-1 font-semibold text-zinc-950">{value}</dd></div>; }
function formatQuantity(value: number | null): string { return value === null ? "Уточняется" : `${value} шт.`; }
function stockStatusLabel(status: ProductCommercialViewDto["stock"] extends infer T ? T extends { status: infer S } ? S | undefined : undefined : undefined): string { switch (status) { case "in_stock": return "В наличии"; case "low_stock": return "Мало на складе"; case "out_of_stock": return "Нет в наличии"; case "expected": return "Ожидается к поступлению"; default: return "Наличие уточняется"; } }
function getStockTone(status: ProductCommercialViewDto["stock"] extends infer T ? T extends { status: infer S } ? S | undefined : undefined : undefined) { switch (status) { case "in_stock": return { panel: "border-emerald-100 bg-emerald-50", badge: "bg-emerald-100 text-emerald-800" }; case "low_stock": return { panel: "border-amber-100 bg-amber-50", badge: "bg-amber-100 text-amber-800" }; case "expected": return { panel: "border-sky-100 bg-sky-50", badge: "bg-sky-100 text-sky-800" }; case "out_of_stock": return { panel: "border-rose-100 bg-rose-50", badge: "bg-rose-100 text-rose-800" }; default: return { panel: "border-zinc-200 bg-zinc-50", badge: "bg-zinc-200 text-zinc-700" }; } }
