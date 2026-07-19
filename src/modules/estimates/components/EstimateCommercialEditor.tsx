"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import {
  removeEstimateLineAction,
  saveEstimateCommercialAction,
} from "../actions/estimate.actions";
import { calculateEstimateCommercials, EstimateCalculationError, resolveCurrencyRate } from "../services/commercial-calculation";
import type { EstimateCommercialOptionsDto, EstimateDetailDto, EstimateServiceDto, SaveEstimateCommercialCommand } from "../services";
import type { EstimateChargeType, EstimateCurrencyChangePolicy, EstimatePricingMode, EstimateUnit, EstimateVatMode } from "../types";
import { EstimateStatusBadge } from "./EstimateStatusBadge";
import { EstimateLinePicker } from "./EstimateLinePicker";

const inputClass = "h-9 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:bg-zinc-100";
const buttonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
const units: Array<{ value: EstimateUnit; label: string }> = [
  { value: "pcs", label: "шт." }, { value: "hour", label: "час" }, { value: "meter", label: "метр" },
  { value: "set", label: "комплект" }, { value: "visit", label: "выезд" }, { value: "service", label: "услуга" },
];
const pricingModes: Array<{ value: EstimatePricingMode; label: string }> = [
  { value: "direct", label: "Цена" }, { value: "markup", label: "Наценка %" }, { value: "margin", label: "Маржа %" },
];
const chargeTypes: Array<{ value: EstimateChargeType; label: string }> = [
  { value: "delivery", label: "Доставка" }, { value: "installation", label: "Монтаж" },
  { value: "commissioning", label: "Пусконаладка" }, { value: "transport", label: "Транспорт" }, { value: "other", label: "Прочее" },
];

type Draft = Pick<EstimateDetailDto, "name" | "customerName" | "projectName" | "validityDays" | "currencyCode" | "vatMode" | "vatRatePercent" | "globalDiscountPercent" | "lines" | "charges"> & {
  sections: Array<Pick<EstimateDetailDto["sections"][number], "id" | "name" | "sortOrder" | "showSubtotal" | "discountPercent">>;
};

export function EstimateCommercialEditor({ initialEstimate, services, commercialOptions }: {
  initialEstimate: EstimateDetailDto;
  services: EstimateServiceDto[];
  commercialOptions: EstimateCommercialOptionsDto;
}) {
  const [estimate, setEstimate] = useState(initialEstimate);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialEstimate));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const [currencyChangePolicy, setCurrencyChangePolicy] = useState<EstimateCurrencyChangePolicy>("preserve_manual");
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const isDraft = estimate.status === "draft";

  const preview = useMemo(() => {
    try {
      return { value: calculateEstimateCommercials({
        lines: draft.lines.map((line) => ({ id: line.id, sectionId: line.sectionId, quantity: line.quantity, pricingMode: line.pricingMode, pricingInputValue: line.pricingInputValue, convertedCostUnitPrice: line.convertedCostUnitPrice, lineDiscountPercent: line.lineDiscountPercent })),
        sections: draft.sections,
        charges: draft.charges,
        globalDiscountPercent: draft.globalDiscountPercent,
        vatMode: draft.vatMode,
        vatRatePercent: draft.vatRatePercent,
      }), error: null };
    } catch (error) {
      return { value: null, error: error instanceof EstimateCalculationError ? error.message : "Проверьте коммерческие значения." };
    }
  }, [draft]);

  const update = (next: (current: Draft) => Draft) => {
    setDraft(next);
    setDirty(true);
    setMessage(null);
  };
  const acceptServer = (next: EstimateDetailDto, nextMessage: string) => {
    setEstimate(next);
    setDraft(toDraft(next));
    setDirty(false);
    setMessage(nextMessage);
  };
  const mutate = (operation: () => ReturnType<typeof saveEstimateCommercialAction>) => startTransition(async () => {
    const result = await operation();
    if (result.success) acceptServer(result.data, result.message);
    else setMessage(result.message);
  });

  const save = () => {
    if (!preview.value) return setMessage(preview.error);
    const payload: SaveEstimateCommercialCommand = {
      expectedRevision: estimate.revision,
      name: draft.name,
      customerName: draft.customerName,
      projectName: draft.projectName,
      validityDays: draft.validityDays,
      currencyCode: draft.currencyCode,
      currencyChangePolicy,
      vatMode: draft.vatMode,
      vatRatePercent: draft.vatRatePercent,
      globalDiscountPercent: draft.globalDiscountPercent,
      sections: draft.sections.map((section, sortOrder) => ({ ...section, sortOrder })),
      lines: draft.lines.map((line, position) => ({
        id: line.id, sectionId: line.sectionId, position: position + 1, description: line.description, quantity: line.quantity,
        unit: line.unit, pricingMode: line.pricingMode, pricingInputValue: line.pricingInputValue,
        internalCostUnitPrice: line.internalCostUnitPrice, lineDiscountPercent: line.lineDiscountPercent,
      })),
      charges: draft.charges.map((charge, sortOrder) => ({ ...charge, sortOrder })),
    };
    mutate(() => saveEstimateCommercialAction(estimate.id, payload));
  };

  return <div className="space-y-5">
    <header className="sticky top-0 z-20 -mx-4 border-b border-zinc-200 bg-zinc-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><strong className="text-xs uppercase text-zinc-500">{estimate.estimateNumber}</strong><EstimateStatusBadge status={estimate.status} />{dirty && <span className="text-xs font-semibold text-amber-700">Есть несохраненные изменения</span>}</div><p className="mt-1 text-xs text-zinc-500">Версия {estimate.revision}</p></div>
        <div className="flex gap-2"><button className={buttonClass} disabled={!dirty || pending || !isDraft} onClick={() => { setDraft(toDraft(estimate)); setDirty(false); }} type="button"><RotateCcw className="size-4" />Отменить</button><button className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={!dirty || pending || !isDraft || !preview.value} onClick={save} type="button"><Save className="size-4" />{pending ? "Сохранение..." : "Сохранить"}</button></div>
      </div>
    </header>
    {message && <p aria-live="polite" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm">{message}</p>}
    {preview.error && <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{preview.error}</p>}

    <section className="grid gap-3 border-y border-zinc-200 bg-white p-4 md:grid-cols-3 xl:grid-cols-6">
      <Field label="Название"><input className={`${inputClass} w-full`} disabled={!isDraft} maxLength={200} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} value={draft.name} /></Field>
      <Field label="Заказчик"><input className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => update((d) => ({ ...d, customerName: e.target.value }))} value={draft.customerName ?? ""} /></Field>
      <Field label="Проект / объект"><input className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => update((d) => ({ ...d, projectName: e.target.value }))} value={draft.projectName ?? ""} /></Field>
      <Field label="Валюта"><select className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => e.target.value !== draft.currencyCode && setCurrencyChoice(e.target.value)} value={draft.currencyCode}>{commercialOptions.currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></Field>
      <Field label="НДС"><select className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => update((d) => ({ ...d, vatMode: e.target.value as EstimateVatMode }))} value={draft.vatMode}><option value="included">Включен</option><option value="separate">Отдельно</option><option value="excluded">Без включения</option><option value="none">Не показывать</option></select></Field>
      <Field label="Ставка НДС, %"><NumberInput disabled={!isDraft || draft.vatMode === "none"} onValue={(value) => update((d) => ({ ...d, vatRatePercent: value ?? 0 }))} value={draft.vatRatePercent} /></Field>
      <Field label="Глобальная скидка, %"><NumberInput disabled={!isDraft} onValue={(value) => update((d) => ({ ...d, globalDiscountPercent: value ?? 0 }))} value={draft.globalDiscountPercent} /></Field>
      <Field label="Срок, дней"><NumberInput disabled={!isDraft} onValue={(value) => update((d) => ({ ...d, validityDays: value ?? 1 }))} value={draft.validityDays} /></Field>
    </section>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <main className="min-w-0 space-y-4">
        <div className="flex justify-between"><h2 className="text-lg font-semibold">Разделы и позиции</h2><button className={buttonClass} disabled={!isDraft} onClick={() => update((d) => ({ ...d, sections: [...d.sections, { id: crypto.randomUUID(), name: "Новый раздел", sortOrder: d.sections.length, showSubtotal: true, discountPercent: 0 }] }))} type="button"><Plus className="size-4" />Раздел</button></div>
        {draft.sections.map((section, sectionIndex) => {
          const sectionLines = draft.lines.filter((line) => line.sectionId === section.id);
          const sectionTotal = preview.value?.sectionTotals.find((item) => item.id === section.id);
          const isCollapsed = collapsed.has(section.id);
          return <section className="border-y border-zinc-200 bg-white" key={section.id}>
            <div className="grid items-center gap-2 border-b border-zinc-200 p-3 sm:grid-cols-[auto_minmax(10rem,1fr)_7rem_auto_auto]">
              <button aria-expanded={!isCollapsed} aria-label="Свернуть раздел" className="p-2" onClick={() => setCollapsed((current) => toggleSet(current, section.id))} type="button">{isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}</button>
              <input aria-label="Название раздела" className={inputClass} disabled={!isDraft} onChange={(e) => update((d) => ({ ...d, sections: d.sections.map((item) => item.id === section.id ? { ...item, name: e.target.value } : item) }))} value={section.name} />
              <Field label="Скидка %"><NumberInput disabled={!isDraft} onValue={(value) => update((d) => ({ ...d, sections: d.sections.map((item) => item.id === section.id ? { ...item, discountPercent: value ?? 0 } : item) }))} value={section.discountPercent} /></Field>
              <span className="text-right text-sm font-semibold">{money(sectionTotal?.total ?? 0, draft.currencyCode)}</span>
              <ReorderButtons disabled={!isDraft} down={sectionIndex === draft.sections.length - 1} onDown={() => update((d) => ({ ...d, sections: move(d.sections, sectionIndex, sectionIndex + 1) }))} onUp={() => update((d) => ({ ...d, sections: move(d.sections, sectionIndex, sectionIndex - 1) }))} up={sectionIndex === 0} />
            </div>
            {!isCollapsed && <div className="divide-y divide-zinc-100">{sectionLines.length ? sectionLines.map((line) => {
              const lineIndex = draft.lines.findIndex((item) => item.id === line.id);
              const sectionLineIndex = sectionLines.findIndex((item) => item.id === line.id);
              const calculated = preview.value?.lines.find((item) => item.id === line.id);
              const costMissing = line.convertedCostUnitPrice === null || line.convertedCostUnitPrice <= 0;
              return <div className="space-y-3 p-3" key={line.id}>
                <div className="grid gap-2 md:grid-cols-[2.5rem_minmax(12rem,1fr)_5rem_6rem_8rem_7rem_8rem_auto] md:items-end">
                  <span className="pb-2 text-sm text-zinc-500">{lineIndex + 1}</span>
                  <Field label="Описание"><input className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => updateLine(draft, setDraft, setDirty, line.id, { description: e.target.value })} value={line.description} /></Field>
                  <Field label="Кол-во"><NumberInput disabled={!isDraft} onValue={(value) => updateLine(draft, setDraft, setDirty, line.id, { quantity: value ?? 0 })} value={line.quantity} /></Field>
                  <Field label="Ед."><select className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => updateLine(draft, setDraft, setDirty, line.id, { unit: e.target.value as EstimateUnit })} value={line.unit}>{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></Field>
                  <Field label={line.pricingMode === "direct" ? "Цена" : line.pricingMode === "markup" ? "Наценка %" : "Маржа %"}><NumberInput disabled={!isDraft} nullable onValue={(value) => updateLine(draft, setDraft, setDirty, line.id, { pricingInputValue: value })} value={line.pricingInputValue} /></Field>
                  <Field label="Скидка %"><NumberInput disabled={!isDraft} onValue={(value) => updateLine(draft, setDraft, setDirty, line.id, { lineDiscountPercent: value ?? 0 })} value={line.lineDiscountPercent} /></Field>
                  <div><p className="text-xs font-medium text-zinc-500">Итого</p><p className="pb-2 pt-2 text-sm font-semibold">{calculated?.lineTotal === null || calculated?.lineTotal === undefined ? "Цена не задана" : money(calculated.lineTotal, draft.currencyCode)}</p></div>
                  <div className="flex"><ReorderButtons disabled={!isDraft} down={sectionLineIndex === sectionLines.length - 1} onDown={() => update((d) => ({ ...d, lines: moveLineWithinSection(d.lines, line.id, 1) }))} onUp={() => update((d) => ({ ...d, lines: moveLineWithinSection(d.lines, line.id, -1) }))} up={sectionLineIndex === 0} /><button aria-label="Удалить позицию" className="p-2 text-red-700" disabled={!isDraft || dirty} onClick={() => mutate(() => removeEstimateLineAction(estimate.id, line.id, estimate.revision))} type="button"><Trash2 className="size-4" /></button></div>
                </div>
                <details className="rounded-md bg-zinc-50 px-3 py-2 text-sm"><summary className="cursor-pointer font-medium">Коммерческие детали</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="Режим"><select className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => updateLine(draft, setDraft, setDirty, line.id, { pricingMode: e.target.value as EstimatePricingMode })} value={line.pricingMode}>{pricingModes.map((mode) => <option disabled={costMissing && mode.value !== "direct"} key={mode.value} value={mode.value}>{mode.label}</option>)}</select></Field>
                  <Field label="Внутренняя себестоимость"><NumberInput disabled={!isDraft || line.lineType === "product"} nullable onValue={(value) => updateLine(draft, setDraft, setDirty, line.id, { internalCostUnitPrice: value, convertedCostUnitPrice: value })} value={line.internalCostUnitPrice} /></Field>
                  <Info label="Источник" value={line.sourcePrice ?? "—"} /><Info label="Наценка" value={percent(calculated?.markupPercent)} /><Info label="Маржа" value={percent(calculated?.marginPercent)} />
                  {costMissing && <p className="text-xs text-amber-800 sm:col-span-2">Нет исходной цены для расчёта.</p>}
                  <Field label="Раздел"><select className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => updateLine(draft, setDraft, setDirty, line.id, { sectionId: e.target.value })} value={line.sectionId}>{draft.sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Info label="Курс" value={line.exchangeRate ? `${line.exchangeRate} · ${line.exchangeRateEffectiveDate ?? ""}` : "—"} />
                </div></details>
              </div>;
            }) : <p className="p-5 text-sm text-zinc-500">В разделе пока нет позиций.</p>}</div>}
          </section>;
        })}
        {isDraft && <EstimateLinePicker disabled={dirty} estimate={estimate} onResult={acceptServer} services={services} />}
        <Charges draft={draft} disabled={!isDraft} update={update} />
      </main>
      <Summary currency={draft.currencyCode} preview={preview.value} />
    </div>
    {currencyChoice && <CurrencyDialog affectedLines={draft.lines.length} current={draft.currencyCode} effectiveDate={commercialOptions.rateEffectiveDate} manualLines={draft.lines.filter((line) => line.lineType !== "product" && line.pricingMode === "direct").length} onCancel={() => setCurrencyChoice(null)} onConfirm={(policy) => {
      if (!commercialOptions.usdMdlRate) return setMessage("Для смены валюты нет опубликованного курса.");
      resolveCurrencyRate(draft.currencyCode, currencyChoice, commercialOptions.usdMdlRate);
      update((current) => ({ ...current, currencyCode: currencyChoice }));
      setCurrencyChangePolicy(policy);
      setCurrencyChoice(null);
    }} rate={commercialOptions.usdMdlRate} target={currencyChoice} />}
  </div>;
}

function Charges({ draft, disabled, update }: { draft: Draft; disabled: boolean; update: (next: (draft: Draft) => Draft) => void }) {
  return <section className="border-y border-zinc-200 bg-white p-4"><div className="flex justify-between"><h2 className="font-semibold">Дополнительные начисления</h2><button className={buttonClass} disabled={disabled} onClick={() => update((d) => ({ ...d, charges: [...d.charges, { id: crypto.randomUUID(), chargeType: "delivery", description: "Доставка", amount: 0, vatApplicable: true, customerVisible: true, sortOrder: d.charges.length }] }))} type="button"><Plus className="size-4" />Добавить</button></div><div className="mt-3 space-y-2">{draft.charges.map((charge) => <div className="grid gap-2 sm:grid-cols-[10rem_minmax(10rem,1fr)_8rem_auto_auto]" key={charge.id}><select className={inputClass} disabled={disabled} onChange={(e) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, chargeType: e.target.value as EstimateChargeType } : item) }))} value={charge.chargeType}>{chargeTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><input className={inputClass} disabled={disabled} onChange={(e) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, description: e.target.value } : item) }))} value={charge.description} /><NumberInput disabled={disabled} onValue={(value) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, amount: value ?? 0 } : item) }))} value={charge.amount} /><label className="flex items-center gap-2 text-xs"><input checked={charge.vatApplicable} disabled={disabled} onChange={(e) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, vatApplicable: e.target.checked } : item) }))} type="checkbox" />НДС</label><button aria-label="Удалить начисление" className={buttonClass} disabled={disabled} onClick={() => update((d) => ({ ...d, charges: d.charges.filter((item) => item.id !== charge.id) }))} type="button"><Trash2 className="size-4" /></button></div>)}</div></section>;
}

function Summary({ currency, preview }: { currency: string; preview: ReturnType<typeof calculateEstimateCommercials> | null }) {
  const rows = preview ? [["Подытог", preview.subtotal], ["Скидки строк", -preview.lineDiscountTotal], ["Скидки разделов", -preview.sectionDiscountTotal], ["Глобальная скидка", -preview.globalDiscountAmount], ["Начисления", preview.chargesTotal], ["НДС", preview.vatAmount], ["Без НДС", preview.totalExcludingVat]] as const : [];
  return <aside className="sticky top-24 border-y border-zinc-200 bg-white p-5"><p className="text-xs font-semibold uppercase text-zinc-500">Итого</p><div className="mt-4 space-y-2">{rows.map(([label, value]) => <div className="flex justify-between gap-3 text-sm" key={label}><span className="text-zinc-500">{label}</span><span>{money(value, currency)}</span></div>)}</div><div className="mt-4 border-t pt-4"><p className="text-2xl font-semibold">{money(preview?.finalTotal ?? 0, currency)}</p><p className="mt-3 text-sm text-zinc-500">Валовая прибыль: {preview?.grossProfit === null || preview?.grossProfit === undefined ? "—" : money(preview.grossProfit, currency)}</p><p className="text-sm text-zinc-500">Общая маржа: {percent(preview?.overallMarginPercent)}</p>{preview?.incompletePricing && <p className="mt-3 bg-amber-50 p-2 text-xs text-amber-900">Есть позиции без рассчитанной цены.</p>}</div></aside>;
}

function CurrencyDialog({ current, target, rate, effectiveDate, affectedLines, manualLines, onCancel, onConfirm }: { current: string; target: string; rate: number | null; effectiveDate: string | null; affectedLines: number; manualLines: number; onCancel: () => void; onConfirm: (policy: EstimateCurrencyChangePolicy) => void }) {
  return <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog"><div className="w-full max-w-lg rounded-md bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold">Смена валюты</h2><dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><dt>Валюта</dt><dd>{current} → {target}</dd><dt>Курс USD/MDL</dt><dd>{rate ?? "Недоступен"}</dd><dt>Дата курса</dt><dd>{effectiveDate ?? "—"}</dd><dt>Позиций</dt><dd>{affectedLines}</dd><dt>Ручных цен</dt><dd>{manualLines}</dd></dl><p className="mt-4 text-sm text-zinc-600">Изменение применяется атомарно при сохранении.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button className={buttonClass} onClick={onCancel} type="button">Отмена</button><button className={buttonClass} disabled={!rate} onClick={() => onConfirm("preserve_manual")} type="button">Сохранить ручные цены</button><button className="h-9 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-45" disabled={!rate} onClick={() => onConfirm("convert_all")} type="button">Конвертировать все</button></div></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="min-w-0 text-xs font-medium text-zinc-600"><span className="mb-1 block">{label}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-sm">{value}</p></div>; }
function NumberInput({ value, onValue, disabled, nullable = false }: { value: number | null; onValue: (value: number | null) => void; disabled?: boolean; nullable?: boolean }) { return <input className={`${inputClass} w-full`} disabled={disabled} min="0" onChange={(event) => onValue(event.target.value === "" ? (nullable ? null : 0) : Number(event.target.value))} step="0.01" type="number" value={value ?? ""} />; }
function ReorderButtons({ onUp, onDown, up, down, disabled }: { onUp: () => void; onDown: () => void; up: boolean; down: boolean; disabled: boolean }) { return <span className="flex"><button aria-label="Переместить вверх" className="p-2" disabled={disabled || up} onClick={onUp} type="button"><ArrowUp className="size-4" /></button><button aria-label="Переместить вниз" className="p-2" disabled={disabled || down} onClick={onDown} type="button"><ArrowDown className="size-4" /></button></span>; }
function toDraft(estimate: EstimateDetailDto): Draft { return { name: estimate.name, customerName: estimate.customerName, projectName: estimate.projectName, validityDays: estimate.validityDays, currencyCode: estimate.currencyCode, vatMode: estimate.vatMode, vatRatePercent: estimate.vatRatePercent, globalDiscountPercent: estimate.globalDiscountPercent, sections: estimate.sections.map(({ id, name, sortOrder, showSubtotal, discountPercent }) => ({ id, name, sortOrder, showSubtotal, discountPercent })), lines: estimate.lines.map((item) => ({ ...item })), charges: estimate.charges.map((item) => ({ ...item })) }; }
function updateLine(draft: Draft, setDraft: React.Dispatch<React.SetStateAction<Draft>>, setDirty: (value: boolean) => void, id: string, patch: Partial<Draft["lines"][number]>) { setDraft({ ...draft, lines: draft.lines.map((line) => line.id === id ? { ...line, ...patch } : line) }); setDirty(true); }
function toggleSet(current: Set<string>, value: string) { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }
function move<T>(values: T[], from: number, to: number): T[] { if (to < 0 || to >= values.length) return values; const next = [...values]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }
function moveLineWithinSection(lines: Draft["lines"], lineId: string, direction: -1 | 1) { const currentIndex = lines.findIndex((line) => line.id === lineId); if (currentIndex < 0) return lines; const sameSection = lines.filter((line) => line.sectionId === lines[currentIndex].sectionId); const sectionIndex = sameSection.findIndex((line) => line.id === lineId); const target = sameSection[sectionIndex + direction]; if (!target) return lines; const targetIndex = lines.findIndex((line) => line.id === target.id); const next = [...lines]; [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]]; return next; }
function money(value: number, currency: string) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value); }
function percent(value: number | null | undefined) { return value === null || value === undefined ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`; }
