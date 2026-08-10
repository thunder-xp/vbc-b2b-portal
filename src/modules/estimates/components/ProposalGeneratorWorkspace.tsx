"use client";

import { Check, ChevronLeft, Loader2, Search, Trash2, WandSparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { ActionFeedback, actionClassName, FormField } from "../../platform-ui";
import { searchEstimateProductsAction, searchExternalNomenclatureAction } from "../actions/estimate.actions";
import { createGeneratedEstimateAction, generateProposalDraftAction } from "../actions/proposal-generator.actions";
import type { ExternalNomenclatureRecord } from "../repositories";
import type { EstimateProductPickerDto } from "../services/estimate.service";
import { GENERATOR_SECTIONS, type GeneratorRequirement, type GeneratorResolutionKind } from "../services/proposal-generator";
import type { FinalCustomer } from "../types";
import { FinalCustomerPicker } from "./FinalCustomerPicker";

type CatalogResult = EstimateProductPickerDto["products"][number];
const inputClass = "min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200";

export function ProposalGeneratorWorkspace({ currencies }: { currencies: string[] }) {
  const router = useRouter();
  const generationKey = useRef(crypto.randomUUID());
  const creationKey = useRef(crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [customer, setCustomer] = useState<FinalCustomer | null>(null);
  const [projectName, setProjectName] = useState("");
  const [requirement, setRequirement] = useState("");
  const [currencyCode, setCurrencyCode] = useState(currencies[0] ?? "USD");
  const [session, setSession] = useState<{ id: string; fingerprint: string } | null>(null);
  const [requirements, setRequirements] = useState<GeneratorRequirement[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const grouped = useMemo(() => new Map(GENERATOR_SECTIONS.map((section) => [section.key, requirements.filter((item) => item.sectionKey === section.key)])), [requirements]);
  const patchLine = (id: string, patch: Partial<GeneratorRequirement>) => setRequirements((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  const generate = () => startTransition(async () => {
    const result = await generateProposalDraftAction({ requirement, requestKey: generationKey.current });
    setMessage(result.message);
    if (result.success) {
      setSession({ id: result.data.sessionId, fingerprint: result.data.fingerprint });
      setRequirements(result.data.requirements);
    }
  });

  const create = () => startTransition(async () => {
    if (!session || !customer) return;
    const result = await createGeneratedEstimateAction({
      sessionId: session.id, sessionFingerprint: session.fingerprint, finalCustomerId: customer.id,
      name: projectName.trim() || `КП для ${customer.displayName}`, projectName, currencyCode, validityDays: 14,
      requestKey: creationKey.current, requirements,
    });
    setMessage(result.message);
    if (result.success) router.push(`/cabinet/estimates/${result.data.estimateId}?generatorSession=${session.id}`);
  });

  if (!session) return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header><p className="text-sm font-semibold text-emerald-700">Сметы и КП</p><h1 className="mt-1 text-2xl font-semibold text-zinc-950">Генератор КП</h1><p className="mt-2 max-w-2xl text-sm text-zinc-600">Опишите задачу свободным текстом. Генератор подготовит структуру сметы без подбора неподтверждённых товаров, цен или остатков.</p></header>
      <section className="space-y-5 border-y border-zinc-200 bg-white px-4 py-6 sm:px-6">
        <FinalCustomerPicker onChange={setCustomer} value={customer?.id ?? null} />
        <FormField label="Проект / объект">{(props) => <input {...props} className={inputClass} maxLength={200} onChange={(event) => setProjectName(event.target.value)} placeholder="Например, склад в Кишинёве" value={projectName} />}</FormField>
        <FormField helperText="Укажите количества, помещения и необходимые работы. До 4 000 символов." label="Краткое описание потребности" required>{(props) => <textarea {...props} className="min-h-40 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200" maxLength={4000} onChange={(event) => { setRequirement(event.target.value); generationKey.current = crypto.randomUUID(); }} placeholder="Нужно видеонаблюдение для склада: 12 камер внутри, 4 камеры снаружи, архив 30 дней, монтаж и настройка." value={requirement} />}</FormField>
        <div className="max-w-48"><FormField label="Валюта" required>{(props) => <select {...props} className={inputClass} onChange={(event) => setCurrencyCode(event.target.value)} value={currencyCode}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>}</FormField></div>
        {message && <ActionFeedback kind="error" message={message} />}
        <button className={actionClassName.primary} disabled={pending || !customer || requirement.trim().length < 10 || !currencies.length} onClick={generate} type="button"><WandSparkles aria-hidden="true" className="size-4" />{pending ? "Формирование..." : "Сформировать черновик"}</button>
        <p className="text-sm text-zinc-500">Обычное создание сметы остаётся доступно в разделе «Мои сметы».</p>
      </section>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 overflow-x-clip">
      <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">Шаг 2 из 2 · Проверка</p><h1 className="mt-1 text-2xl font-semibold">Проверьте структуру сметы</h1><p className="mt-1 text-sm text-zinc-600">Точные соответствия выбираются только вами. Неразрешённые позиции попадут в смету без цены.</p></div><button className={actionClassName.secondary} onClick={() => { setSession(null); setMessage(null); }} type="button"><ChevronLeft className="size-4" />Изменить задачу</button></header>
      <div className="space-y-4">
        {GENERATOR_SECTIONS.map((section) => <section className="overflow-hidden rounded-md border border-zinc-200 bg-white" key={section.key}>
          <div className="flex min-h-12 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4"><h2 className="font-semibold">{section.label}</h2><span className="text-xs text-zinc-500">{grouped.get(section.key)?.length ?? 0} поз.</span></div>
          <div className="divide-y divide-zinc-100">{(grouped.get(section.key) ?? []).length ? grouped.get(section.key)!.map((line) => <GeneratorLine key={line.id} line={line} onChange={(patch) => patchLine(line.id, patch)} onRemove={() => setRequirements((items) => items.filter((item) => item.id !== line.id))} />) : <p className="px-4 py-4 text-sm text-zinc-500">Позиции не предложены.</p>}</div>
        </section>)}
      </div>
      {message && <ActionFeedback kind={message === "Смета создана." ? "success" : "error"} message={message} />}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur"><p className="text-sm text-zinc-600">{requirements.length} позиций · {requirements.filter((line) => line.resolution === "unresolved").length} требуют уточнения</p><button className={actionClassName.primary} disabled={pending || !requirements.length} onClick={create} type="button">{pending ? <><Loader2 className="size-4 animate-spin" />Создание...</> : <><Check className="size-4" />Создать смету</>}</button></div>
    </div>
  );
}

function GeneratorLine({ line, onChange, onRemove }: { line: GeneratorRequirement; onChange: (patch: Partial<GeneratorRequirement>) => void; onRemove: () => void }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState(line.description);
  const [catalog, setCatalog] = useState<CatalogResult[]>([]);
  const [external, setExternal] = useState<ExternalNomenclatureRecord[]>([]);
  const [externalScope, setExternalScope] = useState<"own" | "shared">("own");
  const [pending, startTransition] = useTransition();
  const itemType = line.sectionKey === "installation_materials" ? "material" : line.sectionKey === "equipment" ? "equipment" : "service";
  const search = (scope: "own" | "shared" = "own") => startTransition(async () => {
    const [products, nomenclature] = await Promise.all([
      itemType === "service" ? Promise.resolve(null) : searchEstimateProductsAction({ search: query }),
      searchExternalNomenclatureAction({ query, itemType, scope }),
    ]);
    setCatalog(products?.success ? products.data.products.slice(0, 6) : []);
    setExternal(nomenclature.success ? nomenclature.data : []);
    setExternalScope(scope);
  });
  const select = (resolution: GeneratorResolutionKind, id: string, label: string) => { onChange({ resolution, resolvedId: id, resolvedLabel: label }); setSearchOpen(false); };
  return <div className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_8rem_13rem_auto] lg:items-start">
    <div className="min-w-0"><input aria-label="Описание позиции" className={inputClass} maxLength={500} onChange={(event) => onChange({ description: event.target.value })} value={line.description} /><p className={`mt-1 text-xs ${line.resolution === "unresolved" ? "text-amber-700" : "text-emerald-700"}`}>{line.resolution === "unresolved" ? "Требуется выбор позиции · Цена не указана" : line.resolvedLabel}</p></div>
    <label className="text-xs font-medium text-zinc-600">Количество<input aria-label="Количество" className={`${inputClass} mt-1`} min="0.01" onChange={(event) => onChange({ quantity: Number(event.target.value) })} step="0.01" type="number" value={line.quantity} /></label>
    <select aria-label="Раздел" className={inputClass} onChange={(event) => onChange({ sectionKey: event.target.value as GeneratorRequirement["sectionKey"] })} value={line.sectionKey}>{GENERATOR_SECTIONS.map((section) => <option key={section.key} value={section.key}>{section.label}</option>)}</select>
    <div className="flex gap-2"><button aria-label="Выбрать позицию" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold" onClick={() => setSearchOpen((value) => !value)} type="button"><Search className="size-4" />Выбрать</button><button aria-label="Удалить позицию" className="grid size-11 place-items-center rounded-md border border-zinc-300 text-zinc-600" onClick={onRemove} type="button"><Trash2 className="size-4" /></button></div>
    {searchOpen && <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 lg:col-span-4"><div className="flex min-w-0 flex-col gap-2 sm:flex-row"><input aria-label="Поиск соответствия" className={inputClass} onChange={(event) => setQuery(event.target.value)} value={query} /><button className={actionClassName.secondary} disabled={pending || query.trim().length < 2} onClick={() => search("own")} type="button">Найти</button><button className={actionClassName.secondary} disabled={pending || query.trim().length < 2} onClick={() => search("shared")} type="button">Расширить поиск</button></div>
      <div className="grid gap-2 md:grid-cols-2">{catalog.map((item) => <button className="min-h-11 rounded-md border border-zinc-200 bg-white p-3 text-left text-sm" key={item.id} onClick={() => select("catalog", item.id, `${item.sku} · ${item.name}`)} type="button"><strong>{item.sku}</strong> · {item.name}<span className="mt-1 block text-xs text-zinc-500">{item.retailPrice ?? "Цена уточняется"}</span></button>)}{external.map((item) => <button className="min-h-11 rounded-md border border-zinc-200 bg-white p-3 text-left text-sm" key={item.id} onClick={() => select(externalScope === "shared" ? "shared_nomenclature" : "own_nomenclature", item.id, item.name)} type="button">{item.name}<span className="mt-1 block text-xs text-zinc-500">Внешняя номенклатура · Цена не указана</span></button>)}</div>
      <div className="flex flex-wrap gap-2"><button className="min-h-11 text-sm font-semibold text-emerald-800" onClick={() => { onChange({ resolution: "unresolved", resolvedId: null, resolvedLabel: null }); setSearchOpen(false); }} type="button">Оставить как потребность</button><a className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800" href="/cabinet/nomenclature" rel="noopener noreferrer" target="_blank">Создать внешнюю позицию</a><button aria-label="Закрыть поиск" className="ml-auto grid size-11 place-items-center" onClick={() => setSearchOpen(false)} type="button"><X className="size-4" /></button></div>
    </div>}
  </div>;
}
