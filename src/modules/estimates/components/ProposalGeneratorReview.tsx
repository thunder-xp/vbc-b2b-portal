"use client";

import { Search, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { ProductLineThumbnail } from "../../catalog/components";
import { actionClassName } from "../../platform-ui";
import { searchEstimateProductsAction, searchExternalNomenclatureAction } from "../actions/estimate.actions";
import type { ExternalNomenclatureRecord } from "../repositories";
import type { EstimateProductPickerDto } from "../services/estimate.service";
import { GENERATOR_SECTIONS, type GeneratorRequirement, type GeneratorResolutionKind } from "../services/proposal-generator";
import { NomenclatureCover } from "./NomenclatureCover";

type CatalogResult = EstimateProductPickerDto["products"][number];
type LineState = "automatic" | "manual" | "required" | "incompatible";
const inputClass = "min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200";
const unitLabels: Record<GeneratorRequirement["unit"], string> = { pcs: "шт.", meter: "м", service: "усл.", hour: "ч", set: "компл.", visit: "выезд" };

export function ProposalGeneratorReview({ requirements, currencyCode, incompatibleLineIds = [], onChange }: {
  requirements: GeneratorRequirement[]; currencyCode: string; incompatibleLineIds?: string[];
  onChange: (requirements: GeneratorRequirement[]) => void;
}) {
  const grouped = useMemo(() => new Map(GENERATOR_SECTIONS.map((section) => [section.key, requirements.filter((item) => item.sectionKey === section.key)])), [requirements]);
  const incompatible = useMemo(() => new Set(incompatibleLineIds), [incompatibleLineIds]);
  const patch = (id: string, value: Partial<GeneratorRequirement>) => onChange(requirements.map((item) => item.id === id ? { ...item, ...value } : item));
  return <div className="space-y-4">{GENERATOR_SECTIONS.map((section) => {
    const lines = grouped.get(section.key) ?? [];
    const subtotal = sectionTotal(lines, currencyCode);
    return <section className="overflow-hidden rounded-md border border-zinc-200 bg-white" key={section.key}>
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <div><h2 className="font-semibold">{section.label}</h2><p className="mt-0.5 text-xs text-zinc-500">{lines.length} {positionWord(lines.length)}</p></div>
        {subtotal > 0 && <p className="text-sm font-semibold">{subtotal.toFixed(2)} {currencyCode}</p>}
      </header>
      <div className="divide-y divide-zinc-100">{lines.length ? lines.map((line) => <GeneratorLine
        currencyCode={currencyCode} key={line.id} line={line} onChange={(value) => patch(line.id, value)}
        onRemove={() => onChange(requirements.filter((item) => item.id !== line.id))}
        state={incompatible.has(line.id) ? "incompatible" : lineState(line)}
      />) : <p className="px-4 py-4 text-sm text-zinc-500">Позиции не предложены.</p>}</div>
      {subtotal > 0 && <footer className="border-t border-zinc-200 px-4 py-3 text-right text-sm font-semibold">Итого за {section.label.toLocaleLowerCase("ru-RU")}: {subtotal.toFixed(2)} {currencyCode}</footer>}
    </section>;
  })}</div>;
}

function GeneratorLine({ line, currencyCode, state, onChange, onRemove }: {
  line: GeneratorRequirement; currencyCode: string; state: LineState;
  onChange: (patch: Partial<GeneratorRequirement>) => void; onRemove: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false); const [query, setQuery] = useState(line.description);
  const [catalog, setCatalog] = useState<CatalogResult[]>([]); const [external, setExternal] = useState<ExternalNomenclatureRecord[]>([]);
  const [scope, setScope] = useState<"own" | "shared">("own"); const [pending, startTransition] = useTransition();
  const itemType = line.sectionKey === "installation_materials" ? "material" : line.sectionKey === "equipment" ? "equipment" : "service";
  const search = (nextScope: "own" | "shared") => startTransition(async () => {
    const [products, nomenclature] = await Promise.all([itemType === "service" ? Promise.resolve(null) : searchEstimateProductsAction({ search: query, includeFacets: false }), searchExternalNomenclatureAction({ query, itemType, scope: nextScope })]);
    setCatalog(products?.success ? products.data.products.slice(0, 6) : []); setExternal(nomenclature.success ? nomenclature.data : []); setScope(nextScope);
  });
  const select = (resolution: GeneratorResolutionKind, item: ExternalNomenclatureRecord) => {
    onChange({ resolution, resolvedId: item.id, resolvedLabel: item.name, description: item.name, resolvedSku: null, resolvedImageUrl: null,
      resolvedHasCover: item.hasCover, resolvedCoverScope: item.coverScope, resolvedStockLabel: null,
      resolvedItemType: item.itemType,
      sellingUnitPrice: null, sellingCurrencyCode: null, sellingVatMode: null });
    setSearchOpen(false);
  };
  const selectCatalog = (item: CatalogResult) => {
    onChange({
      resolution: "catalog", resolvedId: item.id, resolvedLabel: item.name, description: item.name,
      resolvedSku: item.sku, resolvedImageUrl: item.imageUrl, resolvedHasCover: false, resolvedCoverScope: null, resolvedItemType: "equipment", resolvedStockLabel: item.stock,
      sellingUnitPrice: item.retailPriceCurrencyCode === currencyCode ? item.retailPriceAmount : null,
      sellingCurrencyCode: item.retailPriceCurrencyCode === currencyCode ? item.retailPriceCurrencyCode : null,
      sellingVatMode: null,
    });
    setSearchOpen(false);
  };
  const unitPrice = line.sellingUnitPrice != null && line.sellingCurrencyCode === currencyCode ? line.sellingUnitPrice : null;
  const amount = unitPrice == null ? null : unitPrice * line.quantity;
  const hasProductVisual = line.sectionKey === "equipment" || line.sectionKey === "installation_materials";
  const showsCatalogImage = hasProductVisual && line.resolution === "catalog";
  const showsNomenclatureCover = hasProductVisual && line.resolvedItemType !== "service"
    && (line.resolution === "own_nomenclature" || line.resolution === "shared_nomenclature");
  const hasVisualColumn = showsCatalogImage || showsNomenclatureCover;
  return <article className="min-w-0 p-4">
    <div className="grid min-w-0 gap-3 lg:grid-cols-[3rem_minmax(11rem,1fr)_5.5rem_8.5rem_auto] lg:items-center">
      {showsCatalogImage && <ProductLineThumbnail imageUrl={line.resolvedImageUrl ?? null} productName={line.resolvedLabel ?? line.description} size="compact" />}
      {showsNomenclatureCover && <NomenclatureCover hasCover={line.resolvedHasCover === true} itemId={line.resolvedId!} name={line.resolvedLabel ?? line.description} size="sm" />}
      <div className={`min-w-0 ${hasVisualColumn ? "" : "lg:col-span-2"}`}>
          {line.resolution === "unresolved" ? <input aria-label="Описание позиции" className={inputClass} maxLength={500} onChange={(event) => onChange({ description: event.target.value })} value={line.description} /> : <p className="break-words text-sm font-semibold text-zinc-950">{line.resolvedLabel ?? line.description}</p>}
          {line.resolvedSku && <p className="mt-0.5 text-xs text-zinc-500">SKU {line.resolvedSku}</p>}
          <LineStateBadge state={state} />
          {line.requirementDescription && line.requirementDescription !== line.description && <p className="mt-1 text-xs text-zinc-500">Исходная потребность: {line.requirementDescription}</p>}
          {line.resolvedStockLabel && <p className="mt-1 text-xs font-medium text-zinc-700">{line.resolvedStockLabel}</p>}
          <p className="mt-1 text-xs text-zinc-600"><span>{unitPrice == null ? "Цена уточняется" : `${unitPrice.toFixed(2)} ${currencyCode}`}</span>{amount != null && <strong className="ml-2 text-zinc-950">· {amount.toFixed(2)} {currencyCode}</strong>}</p>
          {line.assumption && <p className="mt-1 text-xs text-zinc-500">{line.assumption}</p>}
      </div>
      <label className="text-xs font-medium text-zinc-600">Количество<input aria-label="Количество" className={`${inputClass} mt-1`} min="0.01" onChange={(event) => onChange({ quantity: Number(event.target.value) })} step="0.01" type="number" value={line.quantity} /><span className="mt-1 block text-zinc-500">{unitLabels[line.unit]}</span></label>
      <label className="text-xs font-medium text-zinc-600">Раздел<select aria-label="Раздел" className={`${inputClass} mt-1`} onChange={(event) => onChange({ sectionKey: event.target.value as GeneratorRequirement["sectionKey"] })} value={line.sectionKey}>{GENERATOR_SECTIONS.map((section) => <option key={section.key} value={section.key}>{section.label}</option>)}</select></label>
      <div className="flex gap-2 lg:justify-end"><button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold" onClick={() => setSearchOpen((value) => !value)} type="button"><Search className="size-4" />{line.resolution === "unresolved" ? "Выбрать" : "Заменить"}</button><button aria-label="Удалить позицию" className="grid size-11 place-items-center rounded-md border border-zinc-300" onClick={onRemove} type="button"><Trash2 className="size-4" /></button></div>
    </div>
    {searchOpen && <div className="mt-4 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3"><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Поиск соответствия" className={inputClass} onChange={(event) => setQuery(event.target.value)} value={query} /><button className={actionClassName.secondary} disabled={pending || query.trim().length < 2} onClick={() => search("own")} type="button">Найти</button><button className={actionClassName.secondary} disabled={pending || query.trim().length < 2} onClick={() => search("shared")} type="button">Расширить поиск</button></div>
      <div className="grid gap-2 md:grid-cols-2">{catalog.map((item) => <button className="grid min-h-20 grid-cols-[48px_minmax(0,1fr)] gap-3 rounded-md border bg-white p-3 text-left text-sm" key={item.id} onClick={() => selectCatalog(item)} type="button"><ProductLineThumbnail imageUrl={item.imageUrl} productName={item.name} size="compact" /><span className="min-w-0"><strong className="block break-words">{item.name}</strong><span className="mt-1 block text-xs text-zinc-500">SKU {item.sku} · {item.retailPrice ?? "Цена уточняется"}</span><span className="mt-1 block text-xs font-medium text-zinc-700">{item.stock}</span></span></button>)}{external.map((item) => <button className={`grid min-h-20 gap-3 rounded-md border bg-white p-3 text-left text-sm ${item.itemType === "service" ? "" : "grid-cols-[48px_minmax(0,1fr)]"}`} key={item.id} onClick={() => select(scope === "shared" ? "shared_nomenclature" : "own_nomenclature", item)} type="button">{item.itemType !== "service" && <NomenclatureCover hasCover={item.hasCover} itemId={item.id} name={item.name} size="sm" />}<span className="min-w-0"><strong className="block break-words">{item.name}</strong><span className="mt-1 block text-xs text-zinc-500">Цена уточняется</span></span></button>)}</div>
      <div className="flex gap-2"><button className="min-h-11 text-sm font-semibold text-emerald-800" onClick={() => { const original = line.requirementDescription ?? line.description; onChange({ description: original, resolution: "unresolved", resolvedId: null, resolvedLabel: null, resolvedSku: null, resolvedImageUrl: null, resolvedHasCover: false, resolvedCoverScope: null, resolvedItemType: null, resolvedStockLabel: null, sellingUnitPrice: null, sellingCurrencyCode: null, sellingVatMode: null }); setSearchOpen(false); }} type="button">Оставить как потребность</button><button aria-label="Закрыть поиск" className="ml-auto grid size-11 place-items-center" onClick={() => setSearchOpen(false)} type="button"><X className="size-4" /></button></div>
    </div>}
  </article>;
}

function lineState(line: GeneratorRequirement): LineState {
  if (line.resolution === "unresolved") return "required";
  if (line.governedResolvedId && line.resolvedId === line.governedResolvedId) return "automatic";
  return "manual";
}

function LineStateBadge({ state }: { state: LineState }) {
  const content = state === "automatic" ? ["Подобрано автоматически", "bg-emerald-50 text-emerald-800"]
    : state === "manual" ? ["Выбрано вручную", "bg-blue-50 text-blue-800"]
      : state === "incompatible" ? ["Несовместимо", "bg-red-50 text-red-800"]
        : ["Требует выбора", "bg-amber-50 text-amber-900"];
  return <span className={`mt-1.5 inline-flex rounded px-2 py-0.5 text-xs font-medium ${content[1]}`}>{content[0]}</span>;
}

function sectionTotal(lines: readonly GeneratorRequirement[], currencyCode: string) {
  return lines.reduce((sum, line) => sum + (line.sellingCurrencyCode === currencyCode && line.sellingUnitPrice != null ? line.sellingUnitPrice * line.quantity : 0), 0);
}

function positionWord(count: number) {
  const lastTwo = count % 100; const last = count % 10;
  return lastTwo >= 11 && lastTwo <= 14 ? "позиций" : last === 1 ? "позиция" : last >= 2 && last <= 4 ? "позиции" : "позиций";
}
