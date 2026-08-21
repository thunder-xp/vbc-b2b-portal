"use client";

import { Check, PackagePlus, Search, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { ProductThumbnail } from "../../catalog/components/ProductThumbnail";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";

import {
  addEstimateProductsAction,
  addEstimateServicesAction,
  searchEstimateProductsAction,
} from "../actions/estimate.actions";
import type { EstimateDetailDto, EstimateProductPickerDto, EstimateServiceDto } from "../services";
import type { ExternalNomenclatureItemType } from "../repositories";
import { ExternalNomenclaturePicker } from "./ExternalNomenclaturePicker";
import { getCatalogCopy, getEstimatesCopy, usePartnerLocale, type EstimatesCopy } from "../../partner-locale";

const inputClass = "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:bg-zinc-100";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
export type EstimateLinePickerMode = "product" | "service" | "external";

export function EstimateLinePicker({ estimate, services, onResult, disabled, mode, onModeChange, targetSectionId, allowedModes, contextLabel, externalItemType }: {
  estimate: EstimateDetailDto;
  services: EstimateServiceDto[];
  onResult: (next: EstimateDetailDto, message: string) => void;
  disabled: boolean;
  mode: EstimateLinePickerMode | null;
  onModeChange: (mode: EstimateLinePickerMode | null) => void;
  targetSectionId: string;
  allowedModes: ReadonlyArray<EstimateLinePickerMode>;
  contextLabel: string;
  externalItemType: ExternalNomenclatureItemType;
}) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const catalogCopy = getCatalogCopy(locale);
  const [products, setProducts] = useState<EstimateProductPickerDto>({ products: [], categories: [], brands: [] });
  const [productSelection, setProductSelection] = useState<Record<string, number>>({});
  const [serviceSelection, setServiceSelection] = useState<Record<string, { quantity: number; price: number }>>({});
  const [serviceSearch, setServiceSearch] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const insertionRequest = useRef<{ signature: string; key: string } | null>(null);
  const filteredServices = useMemo(() => {
    const query = serviceSearch.trim().toLocaleLowerCase("ru");
    return query ? services.filter((service) => `${service.name} ${service.category}`.toLocaleLowerCase("ru").includes(query)) : services;
  }, [serviceSearch, services]);

  const requestKeyFor = (payload: unknown) => {
    const signature = JSON.stringify(payload);
    if (insertionRequest.current?.signature !== signature) insertionRequest.current = { signature, key: crypto.randomUUID() };
    return insertionRequest.current.key;
  };
  const run = (operation: () => Promise<{ success: boolean; message: string; data: EstimateDetailDto | null }>, eventName?: "estimate_product_added" | "estimate_service_added") => startTransition(async () => {
    const result = await operation();
    setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);
    if (result.success && result.data) {
      if (eventName) recordBehaviorInteraction({ eventName, route: "/cabinet/estimates/detail", sourceSurface: "estimate_line_picker" });
      setProductSelection({});
      setServiceSelection({});
      insertionRequest.current = null;
      onResult(result.data, copy.operationSucceeded);
    }
  });

  const searchProducts = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const search = String(data.get("query") ?? "").trim();
    startTransition(async () => {
      const result = await searchEstimateProductsAction({
        search,
        categoryId: String(data.get("categoryId") ?? "") || undefined,
        brandId: String(data.get("brandId") ?? "") || undefined,
      });
      setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);
      if (result.success) {
        setProducts(result.data);
        if (search) setRecentSearches((current) => [search, ...current.filter((item) => item !== search)].slice(0, 3));
      }
    });
  };

  useEffect(() => {
    if (!mode) return;
    requestAnimationFrame(() => document.getElementById(mode === "product" ? "estimate-product-search" : mode === "service" ? "estimate-service-search" : "estimate-external-manufacturer")?.focus());
  }, [mode]);

  return <section aria-label={copy.addPositions} className="border-y border-zinc-200 bg-white" id="estimate-line-picker" onKeyDown={(event) => {
    if (event.key === "Escape" && mode) { event.preventDefault(); onModeChange(null); }
  }}>
    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">{copy.addingTo}: {contextLabel}</p>
          {allowedModes.length > 1 ? <div aria-label={copy.itemSource} className="mt-2 flex flex-wrap gap-2" role="tablist">
            {allowedModes.map((allowedMode) => <ModeButton active={mode === allowedMode} disabled={disabled} key={allowedMode} label={pickerModeLabel(allowedMode, copy)} onClick={() => onModeChange(allowedMode)} />)}
          </div> : null}
        </div>
        {mode ? <button aria-label={copy.closeAdding} className="inline-flex size-11 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500" onClick={() => onModeChange(null)} type="button"><X className="size-4" /></button> : null}
      </div>
      {message && <p aria-live="polite" className="text-sm text-zinc-600">{message}</p>}
    </div>
    {disabled && <p className="mt-3 text-xs text-amber-800">{copy.saveBeforeAdding}</p>}

    {mode === "product" && <div className="space-y-3 border-t border-zinc-200 p-3 sm:p-4">
      <form className="grid gap-2 lg:grid-cols-[minmax(14rem,1fr)_12rem_12rem_auto]" onSubmit={(event) => { event.preventDefault(); if (!disabled) searchProducts(event.currentTarget); }}>
        <label className="sr-only" htmlFor="estimate-product-search">{copy.productSearchPlaceholder}</label>
        <input className={inputClass} disabled={disabled} id="estimate-product-search" name="query" placeholder={copy.productSearchPlaceholder} />
        <select aria-label={copy.category} className={inputClass} disabled={disabled} name="categoryId"><option value="">{copy.allCategories}</option>{products.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select aria-label={copy.brand} className={inputClass} disabled={disabled} name="brandId"><option value="">{copy.allBrands}</option>{products.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <button className={buttonClass} disabled={disabled || pending} type="submit"><Search className="size-4" />{copy.find}</button>
      </form>
      {recentSearches.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500"><span>{copy.recent}:</span>{recentSearches.map((query) => <span className="rounded bg-zinc-100 px-2 py-1" key={query}>{query}</span>)}</div>}
      <div className="max-h-[28rem] divide-y divide-zinc-100 overflow-y-auto border-y border-zinc-200">
        {products.products.map((product) => {
          const selected = productSelection[product.id] !== undefined;
          return <article className="grid items-center gap-3 py-3 sm:grid-cols-[auto_3rem_minmax(12rem,1fr)_8rem]" key={product.id}>
            <input aria-label={`${copy.select} ${product.name}`} checked={selected} onChange={(event) => setProductSelection((current) => {
              if (event.target.checked) return { ...current, [product.id]: 1 };
              const next = { ...current }; delete next[product.id]; return next;
            })} type="checkbox" />
            <div className="relative flex size-12 items-center justify-center overflow-hidden rounded border border-zinc-200 bg-zinc-50"><ProductThumbnail alt={product.name} className="object-contain p-1" sizes="48px" src={product.imageUrl} variant="xs" /></div>
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-900">{product.name}</p><p className="mt-1 text-xs text-zinc-500">SKU {product.sku} · {[product.brandName, product.categoryName].filter(Boolean).join(" · ")}</p><p className="mt-1 text-xs"><span className="font-semibold">{copy.retailPrice}: {product.retailPrice ?? copy.pricePending}</span> · {pickerStockLabel(product, catalogCopy)}{product.expectedArrival ? ` · ${copy.arrival} ${product.expectedArrival}` : ""}</p></div>
            <label className="text-xs text-zinc-600">{copy.quantity}<input aria-label={`${copy.quantity} ${product.name}`} className={`${inputClass} mt-1 w-full`} disabled={!selected} min="0.001" onChange={(event) => setProductSelection((current) => ({ ...current, [product.id]: Number(event.target.value) }))} step="0.001" type="number" value={productSelection[product.id] ?? 1} /></label>
          </article>;
        })}
      </div>
      <div className="flex justify-end"><button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={disabled || pending || !Object.keys(productSelection).length} onClick={() => { const selections = Object.entries(productSelection).map(([productId, quantity]) => ({ productId, quantity })); const insertion = { targetSectionId, requestKey: requestKeyFor({ targetSectionId, selections }) }; run(() => addEstimateProductsAction(estimate.id, estimate.revision, selections, insertion), "estimate_product_added"); }} type="button"><PackagePlus className="size-4" />{copy.addSelected} ({Object.keys(productSelection).length})</button></div>
    </div>}

    {mode === "service" && <div className="space-y-3 border-t border-zinc-200 p-3 sm:p-4">
      <label className="block text-sm font-medium text-zinc-700">{copy.servicesSearch}<input className={`${inputClass} mt-1 w-full`} disabled={disabled} id="estimate-service-search" onChange={(event) => setServiceSearch(event.target.value)} placeholder={copy.servicesSearchPlaceholder} value={serviceSearch} /></label>
      <div className="max-h-80 divide-y divide-zinc-100 overflow-y-auto border-y border-zinc-200">{filteredServices.map((service) => {
        const selected = serviceSelection[service.id];
        return <div className="grid items-end gap-3 py-3 sm:grid-cols-[auto_minmax(12rem,1fr)_7rem_8rem]" key={service.id}>
          <input aria-label={`${copy.select} ${service.name}`} checked={Boolean(selected)} onChange={(event) => setServiceSelection((current) => {
            if (event.target.checked) return { ...current, [service.id]: { quantity: 1, price: service.defaultSellingPrice ?? 0 } };
            const next = { ...current }; delete next[service.id]; return next;
          })} type="checkbox" />
          <div><p className="text-sm font-semibold">{service.name}</p><p className="text-xs text-zinc-500">{service.category} · {service.unitLabel}</p></div>
          <label className="text-xs">{copy.quantity}<input aria-label={`${copy.quantity} ${service.name}`} className={`${inputClass} mt-1 w-full`} disabled={!selected} min="0.001" onChange={(event) => setServiceSelection((current) => ({ ...current, [service.id]: { ...current[service.id], quantity: Number(event.target.value) } }))} step="0.001" type="number" value={selected?.quantity ?? 1} /></label>
          <label className="text-xs">{copy.price}<input aria-label={`${copy.price} ${service.name}`} className={`${inputClass} mt-1 w-full`} disabled={!selected} min="0" onChange={(event) => setServiceSelection((current) => ({ ...current, [service.id]: { ...current[service.id], price: Number(event.target.value) } }))} step="0.01" type="number" value={selected?.price ?? service.defaultSellingPrice ?? 0} /></label>
        </div>;
      })}</div>
      <div className="flex justify-end"><button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={disabled || pending || !Object.keys(serviceSelection).length} onClick={() => { const selections = Object.entries(serviceSelection).map(([serviceId, selection]) => ({ serviceId, quantity: selection.quantity, sellingUnitPrice: selection.price })); const insertion = { targetSectionId, requestKey: requestKeyFor({ targetSectionId, selections }) }; run(() => addEstimateServicesAction(estimate.id, estimate.revision, selections, insertion), "estimate_service_added"); }} type="button"><Wrench className="size-4" />{copy.addSelected} ({Object.keys(serviceSelection).length})</button></div>
    </div>}

    {mode === "external" && <div className="border-t border-zinc-200 p-3 sm:p-4"><ExternalNomenclaturePicker disabled={disabled} estimate={estimate} itemType={externalItemType} onResult={onResult} targetSectionId={targetSectionId} /></div>}
  </section>;
}

function ModeButton({ active, disabled, label, onClick }: { active: boolean; disabled: boolean; label: string; onClick: () => void }) {
  return <button aria-selected={active} className={`${buttonClass} ${active ? "border-emerald-600 bg-emerald-50 text-emerald-800" : ""}`} disabled={disabled} onClick={onClick} role="tab" type="button">{active && <Check className="size-4" />}{label}</button>;
}

function pickerModeLabel(mode: EstimateLinePickerMode, copy: EstimatesCopy): string {
  if (mode === "product") return copy.catalogNovotech;
  if (mode === "service") return copy.worksAndServices;
  return copy.externalPosition;
}

function pickerStockLabel(product: EstimateProductPickerDto["products"][number], copy: ReturnType<typeof getCatalogCopy>): string {
  if (product.stockStatus === "in_stock") return product.availableQuantity == null ? copy.inStock : `${copy.inStock}: ${product.availableQuantity}`;
  if (product.stockStatus === "low_stock") return product.availableQuantity == null ? copy.lowStock : `${copy.lowStock}: ${product.availableQuantity}`;
  if (product.stockStatus === "expected") return copy.expected;
  if (product.stockStatus === "out_of_stock") return copy.outOfStock;
  return copy.availabilityPending;
}
