"use client";

import { Check, ImageIcon, PackagePlus, Plus, Search, Wrench } from "lucide-react";
import Image from "next/image";
import { useMemo, useState, useTransition } from "react";

import {
  addEstimateCustomLineAction,
  addEstimateProductsAction,
  addEstimateServicesAction,
  searchEstimateProductsAction,
} from "../actions/estimate.actions";
import type { EstimateDetailDto, EstimateProductPickerDto, EstimateServiceDto } from "../services";

const inputClass = "h-9 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:bg-zinc-100";
const buttonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
type Mode = "product" | "service" | "custom";

export function EstimateLinePicker({ estimate, services, onResult, disabled }: {
  estimate: EstimateDetailDto;
  services: EstimateServiceDto[];
  onResult: (next: EstimateDetailDto, message: string) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<Mode>("product");
  const [products, setProducts] = useState<EstimateProductPickerDto>({ products: [], categories: [], brands: [] });
  const [productSelection, setProductSelection] = useState<Record<string, number>>({});
  const [serviceSelection, setServiceSelection] = useState<Record<string, { quantity: number; price: number }>>({});
  const [serviceSearch, setServiceSearch] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const filteredServices = useMemo(() => {
    const query = serviceSearch.trim().toLocaleLowerCase("ru");
    return query ? services.filter((service) => `${service.name} ${service.category}`.toLocaleLowerCase("ru").includes(query)) : services;
  }, [serviceSearch, services]);

  const run = (operation: () => Promise<{ success: boolean; message: string; data: EstimateDetailDto | null }>) => startTransition(async () => {
    const result = await operation();
    setMessage(result.message);
    if (result.success && result.data) {
      setProductSelection({});
      setServiceSelection({});
      onResult(result.data, result.message);
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
      setMessage(result.message);
      if (result.success) {
        setProducts(result.data);
        if (search) setRecentSearches((current) => [search, ...current.filter((item) => item !== search)].slice(0, 3));
      }
    });
  };

  return <section aria-label="Добавление позиций" className="border-y border-zinc-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div aria-label="Тип позиции" className="flex flex-wrap gap-2" role="tablist">
        <ModeButton active={mode === "product"} disabled={disabled} label="Оборудование" onClick={() => setMode("product")} />
        <ModeButton active={mode === "service"} disabled={disabled} label="Добавить работы и услуги" onClick={() => setMode("service")} />
        <ModeButton active={mode === "custom"} disabled={disabled} label="Своя позиция" onClick={() => setMode("custom")} />
      </div>
      {message && <p aria-live="polite" className="text-sm text-zinc-600">{message}</p>}
    </div>
    {disabled && <p className="mt-3 text-xs text-amber-800">Сохраните или отмените текущие изменения перед добавлением позиций.</p>}

    {mode === "product" && <div className="mt-4 space-y-3">
      <form className="grid gap-2 lg:grid-cols-[minmax(14rem,1fr)_12rem_12rem_auto]" onSubmit={(event) => { event.preventDefault(); if (!disabled) searchProducts(event.currentTarget); }}>
        <label className="sr-only" htmlFor="estimate-product-search">SKU, модель или название</label>
        <input className={inputClass} disabled={disabled} id="estimate-product-search" name="query" placeholder="SKU, модель или название" />
        <select aria-label="Категория" className={inputClass} disabled={disabled} name="categoryId"><option value="">Все категории</option>{products.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select aria-label="Бренд" className={inputClass} disabled={disabled} name="brandId"><option value="">Все бренды</option>{products.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <button className={buttonClass} disabled={disabled || pending} type="submit"><Search className="size-4" />Найти</button>
      </form>
      {recentSearches.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500"><span>Недавние:</span>{recentSearches.map((query) => <span className="rounded bg-zinc-100 px-2 py-1" key={query}>{query}</span>)}</div>}
      <div className="max-h-[28rem] divide-y divide-zinc-100 overflow-y-auto border-y border-zinc-200">
        {products.products.map((product) => {
          const selected = productSelection[product.id] !== undefined;
          return <article className="grid items-center gap-3 py-3 sm:grid-cols-[auto_3rem_minmax(12rem,1fr)_8rem]" key={product.id}>
            <input aria-label={`Выбрать ${product.name}`} checked={selected} onChange={(event) => setProductSelection((current) => {
              if (event.target.checked) return { ...current, [product.id]: 1 };
              const next = { ...current }; delete next[product.id]; return next;
            })} type="checkbox" />
            <div className="flex size-12 items-center justify-center overflow-hidden rounded border border-zinc-200 bg-zinc-50">{product.imageUrl ? <Image alt="" className="h-full w-full object-contain" height={48} src={product.imageUrl} width={48} /> : <ImageIcon className="size-5 text-zinc-400" />}</div>
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-900">{product.name}</p><p className="mt-1 text-xs text-zinc-500">SKU {product.sku} · {[product.brandName, product.categoryName].filter(Boolean).join(" · ")}</p><p className="mt-1 text-xs"><span className="font-semibold">{product.partnerPrice ?? "Цена уточняется"}</span> · {product.stock}{product.expectedArrival ? ` · Поступление ${product.expectedArrival}` : ""}</p></div>
            <label className="text-xs text-zinc-600">Количество<input aria-label={`Количество ${product.name}`} className={`${inputClass} mt-1 w-full`} disabled={!selected} min="0.001" onChange={(event) => setProductSelection((current) => ({ ...current, [product.id]: Number(event.target.value) }))} step="0.001" type="number" value={productSelection[product.id] ?? 1} /></label>
          </article>;
        })}
      </div>
      <div className="flex justify-end"><button className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={disabled || pending || !Object.keys(productSelection).length} onClick={() => run(() => addEstimateProductsAction(estimate.id, estimate.revision, Object.entries(productSelection).map(([productId, quantity]) => ({ productId, quantity }))))} type="button"><PackagePlus className="size-4" />Добавить выбранные ({Object.keys(productSelection).length})</button></div>
    </div>}

    {mode === "service" && <div className="mt-4 space-y-3">
      <label className="block text-sm font-medium text-zinc-700">Поиск работ и услуг<input className={`${inputClass} mt-1 w-full`} disabled={disabled} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Монтаж, настройка, кабельные работы" value={serviceSearch} /></label>
      <div className="max-h-80 divide-y divide-zinc-100 overflow-y-auto border-y border-zinc-200">{filteredServices.map((service) => {
        const selected = serviceSelection[service.id];
        return <div className="grid items-end gap-3 py-3 sm:grid-cols-[auto_minmax(12rem,1fr)_7rem_8rem]" key={service.id}>
          <input aria-label={`Выбрать ${service.name}`} checked={Boolean(selected)} onChange={(event) => setServiceSelection((current) => {
            if (event.target.checked) return { ...current, [service.id]: { quantity: 1, price: service.defaultSellingPrice ?? 0 } };
            const next = { ...current }; delete next[service.id]; return next;
          })} type="checkbox" />
          <div><p className="text-sm font-semibold">{service.name}</p><p className="text-xs text-zinc-500">{service.category} · {service.unitLabel}</p></div>
          <label className="text-xs">Количество<input aria-label={`Количество ${service.name}`} className={`${inputClass} mt-1 w-full`} disabled={!selected} min="0.001" onChange={(event) => setServiceSelection((current) => ({ ...current, [service.id]: { ...current[service.id], quantity: Number(event.target.value) } }))} step="0.001" type="number" value={selected?.quantity ?? 1} /></label>
          <label className="text-xs">Цена<input aria-label={`Цена ${service.name}`} className={`${inputClass} mt-1 w-full`} disabled={!selected} min="0" onChange={(event) => setServiceSelection((current) => ({ ...current, [service.id]: { ...current[service.id], price: Number(event.target.value) } }))} step="0.01" type="number" value={selected?.price ?? service.defaultSellingPrice ?? 0} /></label>
        </div>;
      })}</div>
      <div className="flex justify-end"><button className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={disabled || pending || !Object.keys(serviceSelection).length} onClick={() => run(() => addEstimateServicesAction(estimate.id, estimate.revision, Object.entries(serviceSelection).map(([serviceId, selection]) => ({ serviceId, quantity: selection.quantity, sellingUnitPrice: selection.price }))))} type="button"><Wrench className="size-4" />Добавить выбранные ({Object.keys(serviceSelection).length})</button></div>
    </div>}

    {mode === "custom" && <form className="mt-4 grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_7rem_8rem_auto]" onSubmit={(event) => { event.preventDefault(); if (disabled) return; const data = new FormData(event.currentTarget); run(() => addEstimateCustomLineAction(estimate.id, { expectedRevision: estimate.revision, description: String(data.get("description")), unit: "service", quantity: Number(data.get("quantity")), sellingUnitPrice: Number(data.get("price")) })); }}>
      <input aria-label="Описание" className={inputClass} disabled={disabled} name="description" placeholder="Описание собственной работы или материала" required />
      <input aria-label="Количество" className={inputClass} defaultValue="1" disabled={disabled} min="0.001" name="quantity" step="0.001" type="number" />
      <input aria-label="Цена" className={inputClass} disabled={disabled} min="0" name="price" placeholder="Цена" step="0.01" type="number" />
      <button className={buttonClass} disabled={disabled || pending} type="submit"><Plus className="size-4" />Добавить</button>
    </form>}
  </section>;
}

function ModeButton({ active, disabled, label, onClick }: { active: boolean; disabled: boolean; label: string; onClick: () => void }) {
  return <button aria-selected={active} className={`${buttonClass} ${active ? "border-emerald-600 bg-emerald-50 text-emerald-800" : ""}`} disabled={disabled} onClick={onClick} role="tab" type="button">{active && <Check className="size-4" />}{label}</button>;
}
