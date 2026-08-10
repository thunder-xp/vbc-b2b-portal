"use client";

import { Search, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { actionClassName } from "../../platform-ui";
import { searchEstimateProductsAction, searchExternalNomenclatureAction } from "../actions/estimate.actions";
import type { ExternalNomenclatureRecord } from "../repositories";
import type { EstimateProductPickerDto } from "../services/estimate.service";
import { GENERATOR_SECTIONS, type GeneratorRequirement, type GeneratorResolutionKind } from "../services/proposal-generator";

type CatalogResult = EstimateProductPickerDto["products"][number];
const inputClass = "min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200";

export function ProposalGeneratorReview({ requirements, currencyCode, onChange }: { requirements: GeneratorRequirement[]; currencyCode: string; onChange: (requirements: GeneratorRequirement[]) => void }) {
  const grouped = useMemo(() => new Map(GENERATOR_SECTIONS.map((section) => [section.key, requirements.filter((item) => item.sectionKey === section.key)])), [requirements]);
  const patch = (id: string, value: Partial<GeneratorRequirement>) => onChange(requirements.map((item) => item.id === id ? { ...item, ...value } : item));
  return <div className="space-y-4">{GENERATOR_SECTIONS.map((section) => {
    const lines = grouped.get(section.key) ?? [];
    const subtotal = lines.reduce((sum, line) => sum + (line.sellingCurrencyCode === currencyCode && line.sellingUnitPrice != null ? line.sellingUnitPrice * line.quantity : 0), 0);
    return <section className="overflow-hidden rounded-md border border-zinc-200 bg-white" key={section.key}>
      <div className="flex min-h-12 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4"><h2 className="font-semibold">{section.label}</h2><span className="text-xs text-zinc-500">{lines.length} поз.</span></div>
      <div className="divide-y divide-zinc-100">{lines.length ? lines.map((line) => <GeneratorLine key={line.id} line={line} onChange={(value) => patch(line.id, value)} onRemove={() => onChange(requirements.filter((item) => item.id !== line.id))} />) : <p className="px-4 py-4 text-sm text-zinc-500">Позиции не предложены.</p>}</div>
      {subtotal > 0 && <div className="border-t border-zinc-200 px-4 py-3 text-right text-sm font-semibold">Итого: {subtotal.toFixed(2)} {currencyCode}</div>}
    </section>;
  })}</div>;
}

function GeneratorLine({ line, onChange, onRemove }: { line: GeneratorRequirement; onChange: (patch: Partial<GeneratorRequirement>) => void; onRemove: () => void }) {
  const [searchOpen, setSearchOpen] = useState(false); const [query, setQuery] = useState(line.description);
  const [catalog, setCatalog] = useState<CatalogResult[]>([]); const [external, setExternal] = useState<ExternalNomenclatureRecord[]>([]);
  const [scope, setScope] = useState<"own" | "shared">("own"); const [pending, startTransition] = useTransition();
  const itemType = line.sectionKey === "installation_materials" ? "material" : line.sectionKey === "equipment" ? "equipment" : "service";
  const search = (nextScope: "own" | "shared") => startTransition(async () => {
    const [products, nomenclature] = await Promise.all([itemType === "service" ? Promise.resolve(null) : searchEstimateProductsAction({ search: query }), searchExternalNomenclatureAction({ query, itemType, scope: nextScope })]);
    setCatalog(products?.success ? products.data.products.slice(0, 6) : []); setExternal(nomenclature.success ? nomenclature.data : []); setScope(nextScope);
  });
  const select = (resolution: GeneratorResolutionKind, id: string, label: string) => { onChange({ resolution, resolvedId: id, resolvedLabel: label, sellingUnitPrice: null, sellingCurrencyCode: null }); setSearchOpen(false); };
  return <div className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_8rem_13rem_auto] lg:items-start">
    <div className="min-w-0"><input aria-label="Описание позиции" className={inputClass} maxLength={500} onChange={(event) => onChange({ description: event.target.value })} value={line.description} /><p className={`mt-1 text-xs ${line.resolution === "unresolved" ? "text-amber-700" : "text-emerald-700"}`}>{line.resolution === "unresolved" ? "Требуется выбор позиции · Цена не указана" : line.resolvedLabel}</p>{line.sellingUnitPrice != null && <p className="mt-1 text-xs font-semibold">{line.sellingUnitPrice.toFixed(2)} {line.sellingCurrencyCode} · итого {(line.sellingUnitPrice * line.quantity).toFixed(2)} {line.sellingCurrencyCode}</p>}{line.assumption && <p className="mt-1 text-xs text-zinc-500">{line.assumption}</p>}</div>
    <label className="text-xs font-medium text-zinc-600">Количество<input aria-label="Количество" className={`${inputClass} mt-1`} min="0.01" onChange={(event) => onChange({ quantity: Number(event.target.value) })} step="0.01" type="number" value={line.quantity} /></label>
    <select aria-label="Раздел" className={inputClass} onChange={(event) => onChange({ sectionKey: event.target.value as GeneratorRequirement["sectionKey"] })} value={line.sectionKey}>{GENERATOR_SECTIONS.map((section) => <option key={section.key} value={section.key}>{section.label}</option>)}</select>
    <div className="flex gap-2"><button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold" onClick={() => setSearchOpen((value) => !value)} type="button"><Search className="size-4" />Выбрать</button><button aria-label="Удалить позицию" className="grid size-11 place-items-center rounded-md border border-zinc-300" onClick={onRemove} type="button"><Trash2 className="size-4" /></button></div>
    {searchOpen && <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 lg:col-span-4"><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Поиск соответствия" className={inputClass} onChange={(event) => setQuery(event.target.value)} value={query} /><button className={actionClassName.secondary} disabled={pending || query.trim().length < 2} onClick={() => search("own")} type="button">Найти</button><button className={actionClassName.secondary} disabled={pending || query.trim().length < 2} onClick={() => search("shared")} type="button">Расширить поиск</button></div>
      <div className="grid gap-2 md:grid-cols-2">{catalog.map((item) => <button className="min-h-11 rounded-md border bg-white p-3 text-left text-sm" key={item.id} onClick={() => select("catalog", item.id, `${item.sku} · ${item.name}`)} type="button"><strong>{item.sku}</strong> · {item.name}<span className="block text-xs text-zinc-500">{item.retailPrice ?? "Цена уточняется"}</span></button>)}{external.map((item) => <button className="min-h-11 rounded-md border bg-white p-3 text-left text-sm" key={item.id} onClick={() => select(scope === "shared" ? "shared_nomenclature" : "own_nomenclature", item.id, item.name)} type="button">{item.name}<span className="block text-xs text-zinc-500">Цена не указана</span></button>)}</div>
      <div className="flex gap-2"><button className="min-h-11 text-sm font-semibold text-emerald-800" onClick={() => { onChange({ resolution: "unresolved", resolvedId: null, resolvedLabel: null, sellingUnitPrice: null }); setSearchOpen(false); }} type="button">Оставить как потребность</button><button aria-label="Закрыть поиск" className="ml-auto grid size-11 place-items-center" onClick={() => setSearchOpen(false)} type="button"><X className="size-4" /></button></div>
    </div>}
  </div>;
}
