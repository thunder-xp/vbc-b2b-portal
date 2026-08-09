"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ListFilter, MoreHorizontal, Plus, RotateCcw, Save, SaveAll, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { ProductLineThumbnail } from "../../catalog/components/ProductLineThumbnail";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import {
  checkEstimateCommercialStateAction,
  removeEstimateLineAction,
  removeEstimateLinesAction,
  saveEstimateCommercialAction,
} from "../actions/estimate.actions";
import { calculateEstimateCommercials, EstimateCalculationError, resolveCurrencyRate } from "../services/commercial-calculation";
import { applyBulkDiscount, applyBulkMarkup, moveBulkLines, resetBulkToPartnerPrice, updateBulkQuantity, type EstimateBulkResult } from "../services/estimate-bulk-operations";
import type { EstimateCommercialCheckDto, EstimateCommercialOptionsDto, EstimateDetailDto, EstimateServiceDto, SaveEstimateCommercialCommand } from "../services";
import type { EstimateChargeType, EstimateCurrencyChangePolicy, EstimatePricingMode, EstimateUnit, EstimateVatMode, EstimateWorkflowDto } from "../types";
import { EstimateStatusBadge } from "./EstimateStatusBadge";
import { EstimateBulkToolbar } from "./EstimateBulkToolbar";
import { EstimateLinePicker, type EstimateLinePickerMode } from "./EstimateLinePicker";
import { EstimateProposalSidebar } from "./EstimateProposalSidebar";
import { FinalCustomerPicker } from "./FinalCustomerPicker";

const inputClass = "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:bg-zinc-100";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
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
  finalCustomerId: string | null;
  sections: Array<Pick<EstimateDetailDto["sections"][number], "id" | "name" | "sortOrder" | "showSubtotal" | "discountPercent">>;
};

export function EstimateCommercialEditor({ initialEstimate, services, commercialOptions, workflow }: {
  initialEstimate: EstimateDetailDto;
  services: EstimateServiceDto[];
  commercialOptions: EstimateCommercialOptionsDto;
  workflow: EstimateWorkflowDto;
}) {
  const router = useRouter();
  const [estimate, setEstimate] = useState(initialEstimate);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialEstimate));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const [currencyChangePolicy, setCurrencyChangePolicy] = useState<EstimateCurrencyChangePolicy>("preserve_manual");
  const [pending, startTransition] = useTransition();
  const [checking, startCheck] = useTransition();
  const [commercialCheck, setCommercialCheck] = useState<EstimateCommercialCheckDto | null>(null);
  const [checkedLineIds, setCheckedLineIds] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [pickerMode, setPickerMode] = useState<EstimateLinePickerMode | null>(null);
  const [targetSectionId, setTargetSectionId] = useState(initialEstimate.sections[0]?.id ?? "");
  const [lineSearch, setLineSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const isDraft = estimate.status === "draft";
  const retailOnly = estimate.commercialMode === "retail_only";

  const preview = useMemo(() => {
    try {
      return { value: calculateEstimateCommercials({
        lines: draft.lines.map((line) => ({ id: line.id, sectionId: line.sectionId, quantity: line.quantity, pricingMode: line.pricingMode, pricingInputValue: line.pricingInputValue, convertedCostUnitPrice: line.convertedCostUnitPrice ?? null, lineDiscountPercent: line.lineDiscountPercent })),
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
    setSelectedLineIds(new Set());
  };
  const mutate = (operation: () => ReturnType<typeof saveEstimateCommercialAction>, after?: () => void) => startTransition(async () => {
    const result = await operation();
    if (result.success) { acceptServer(result.data, result.message); after?.(); }
    else setMessage(result.message);
  });

  const save = (exitAfter = false) => {
    if (!preview.value) return setMessage(preview.error);
    const payload: SaveEstimateCommercialCommand = {
      expectedRevision: estimate.revision,
      name: draft.name,
      finalCustomerId: draft.finalCustomerId,
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
        internalCostUnitPrice: line.internalCostUnitPrice ?? null, lineDiscountPercent: line.lineDiscountPercent,
      })),
      charges: draft.charges.map((charge, sortOrder) => ({ ...charge, sortOrder })),
    };
    mutate(() => saveEstimateCommercialAction(estimate.id, payload), exitAfter ? () => router.push("/cabinet/estimates") : undefined);
  };
  const applyBulkResult = (result: EstimateBulkResult, label: string) => {
    setDraft((current) => ({ ...current, lines: result.lines }));
    setDirty((current) => result.changedCount > 0 || current);
    setMessage(`${label}: ${result.changedCount}.${result.skippedCount ? ` Пропущено: ${result.skippedCount}.` : ""}`);
  };
  const checkCommercialState = () => startCheck(async () => {
    recordBehaviorInteraction({ eventName: "estimate_price_check_started", route: "/cabinet/estimates/detail", sourceSurface: "estimate_editor" });
    const result = await checkEstimateCommercialStateAction(estimate.id);
    setMessage(result.message);
    if (result.success) {
      setCommercialCheck(result.data);
      setCheckedLineIds(new Set(result.data.lines.filter((line) => line.priceChanged && line.currentPrice !== null).map((line) => line.lineId)));
    }
  });
  const openPickerForSection = (sectionId: string, mode: EstimateLinePickerMode = "product") => {
    setTargetSectionId(sectionId);
    setPickerMode(mode);
    requestAnimationFrame(() => document.getElementById("estimate-line-picker")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const acceptAddedLines = (next: EstimateDetailDto, nextMessage: string) => {
    const existingIds = new Set(estimate.lines.map((line) => line.id));
    const addedIds = new Set(next.lines.filter((line) => !existingIds.has(line.id)).map((line) => line.id));
    if (!targetSectionId || !addedIds.size || next.lines.every((line) => !addedIds.has(line.id) || line.sectionId === targetSectionId)) {
      acceptServer(next, nextMessage);
      return;
    }
    setEstimate(next);
    setDraft(toDraft({ ...next, lines: next.lines.map((line) => addedIds.has(line.id) ? { ...line, sectionId: targetSectionId } : line) }));
    setDirty(true);
    setSelectedLineIds(new Set());
    setMessage(`${nextMessage} Позиции назначены выбранному разделу — сохраните смету.`);
  };
  const normalizedLineSearch = lineSearch.trim().toLocaleLowerCase("ru");
  const visibleSections = draft.sections.filter((section) => sectionFilter === "all" || section.id === sectionFilter);

  return <div className="min-w-0 space-y-5" data-testid="estimate-workspace" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (dirty && !pending && isDraft && preview.value) save();
    }
  }}>
    <header className="sticky top-0 z-20 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:-mx-8 lg:px-8">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><Link className="text-xs font-semibold text-emerald-700" href="/cabinet/estimates" prefetch={false}>← Сметы и КП</Link><strong className="text-xs uppercase text-zinc-500">{estimate.estimateNumber}</strong><EstimateStatusBadge status={estimate.status === "archived" ? "archived" : estimate.lifecycleStatus} /><span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">Версия {estimate.revision}</span>{dirty && <span className="text-xs font-semibold text-amber-700">Не сохранено</span>}</div>
          <h1 className="mt-1 truncate text-xl font-semibold text-zinc-950" title={draft.name}>{draft.name || "Без названия"}</h1>
          <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600"><Meta label="Заказчик" value={draft.customerName ?? "Не выбран"} /><Meta label="Проект" value={draft.projectName ?? "Не указан"} /><Meta label="Расчёт" value={`${draft.currencyCode} · ${vatModeLabel(draft.vatMode)}`} /><Meta label="Срок" value={`${draft.validityDays} дн.`} /></dl>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <details className="relative"><summary className={`${buttonClass} cursor-pointer list-none`}><MoreHorizontal className="size-4" />Действия</summary><div className="absolute right-0 z-30 mt-2 grid w-72 gap-1 rounded-md border border-zinc-200 bg-white p-2 shadow-lg"><button className={`${buttonClass} justify-start border-0`} disabled={!dirty || pending || !isDraft} onClick={() => { setDraft(toDraft(estimate)); setDirty(false); }} type="button"><RotateCcw className="size-4" />Отменить изменения</button><button className={`${buttonClass} justify-start border-0`} disabled={checking || !isDraft || dirty} onClick={checkCommercialState} type="button"><RotateCcw className={`size-4 ${checking ? "animate-spin" : ""}`} />{checking ? "Проверка..." : "Проверить цены и наличие"}</button></div></details>
          <button aria-keyshortcuts="Control+S Meta+S" aria-label="Сохранить" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={!dirty || pending || !isDraft || !preview.value} onClick={() => save()} type="button"><Save className="size-4" />{pending ? "Сохранение..." : "Сохранить"}</button>
          <button className={buttonClass} disabled={!dirty || pending || !isDraft || !preview.value} onClick={() => save(true)} type="button"><SaveAll className="size-4" />Сохранить и выйти</button>
        </div>
      </div>
    </header>
    {message && <p aria-live="polite" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm">{message}</p>}
    {preview.error && <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{preview.error}</p>}

    <details className="border-y border-zinc-200 bg-white"><summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-800"><span>Параметры сметы</span><span className="text-xs font-normal text-zinc-500">Заказчик, проект, валюта, НДС и срок</span></summary><div className="grid min-w-0 gap-3 border-t border-zinc-200 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Название"><input className={`${inputClass} w-full`} disabled={!isDraft} maxLength={200} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} value={draft.name} /></Field>
        <div className="min-w-0 max-w-full sm:col-span-2"><FinalCustomerPicker disabled={!isDraft} initialName={draft.customerName} onChange={(customer) => update((d) => ({ ...d, finalCustomerId: customer?.id ?? null, customerName: customer?.displayName ?? null }))} value={draft.finalCustomerId} /></div>
        <Field label="Проект / объект"><input className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => update((d) => ({ ...d, projectName: e.target.value }))} value={draft.projectName ?? ""} /></Field>
        <Field label="Валюта"><select className={`${inputClass} w-full`} disabled={!isDraft || retailOnly} onChange={(e) => e.target.value !== draft.currencyCode && setCurrencyChoice(e.target.value)} value={draft.currencyCode}>{commercialOptions.currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></Field>
        <Field label="НДС"><select className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => update((d) => ({ ...d, vatMode: e.target.value as EstimateVatMode }))} value={draft.vatMode}><option value="included">Цены с НДС</option><option value="separate">НДС начисляется отдельно</option><option value="excluded">Цены без НДС</option><option value="none">НДС не применяется</option></select></Field>
        <Field label="Ставка НДС, %"><NumberInput disabled={!isDraft || draft.vatMode === "none"} onValue={(value) => update((d) => ({ ...d, vatRatePercent: value ?? 0 }))} value={draft.vatRatePercent} /></Field>
        <Field label="Скидка на всю смету, %"><NumberInput disabled={!isDraft} onValue={(value) => update((d) => ({ ...d, globalDiscountPercent: value ?? 0 }))} value={draft.globalDiscountPercent} /></Field>
        <Field label="Срок, дней"><NumberInput disabled={!isDraft} onValue={(value) => update((d) => ({ ...d, validityDays: value ?? 1 }))} value={draft.validityDays} /></Field>
        {commercialOptions.rateFreshness ? <div className="text-xs text-zinc-500 sm:col-span-2 xl:col-span-4"><p>{commercialOptions.rateFreshness.label}</p>{commercialOptions.rateFreshness.staleNotice ? <p className="mt-1 text-amber-800">Курс устарел. Проверьте дату перед подготовкой предложения.</p> : null}</div> : null}
      </div></details>

    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <main className="min-w-0 space-y-4">
        {isDraft && <EstimateLinePicker disabled={dirty} estimate={estimate} mode={pickerMode} onModeChange={setPickerMode} onResult={acceptAddedLines} services={services} workspaceControls={<div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(10rem,1fr)_12rem_auto]">
          <label className="relative min-w-0"><span className="sr-only">Поиск по позициям сметы</span><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-400" /><input className={`${inputClass} w-full pl-9`} onChange={(event) => setLineSearch(event.target.value)} placeholder="Поиск по позициям" value={lineSearch} /></label>
          <label className="relative min-w-0"><span className="sr-only">Фильтр разделов</span><ListFilter className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-400" /><select className={`${inputClass} w-full pl-9`} onChange={(event) => setSectionFilter(event.target.value)} value={sectionFilter}><option value="all">Все разделы</option>{draft.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
          <button className={buttonClass} disabled={!isDraft} onClick={() => update((d) => ({ ...d, sections: [...d.sections, { id: crypto.randomUUID(), name: "Новый раздел", sortOrder: d.sections.length, showSubtotal: true, discountPercent: 0 }] }))} type="button"><Plus className="size-4" />Раздел</button>
        </div>} />}
        {commercialCheck ? <section className="border-y border-zinc-200 bg-white p-4"><PriceCheckPanel
            checkedLineIds={checkedLineIds}
            check={commercialCheck}
            onApply={() => {
              update((current) => ({ ...current, lines: current.lines.map((line) => {
                const comparison = commercialCheck.lines.find((item) => item.lineId === line.id);
                return comparison && checkedLineIds.has(line.id) && comparison.currentPrice !== null
                  ? { ...line, pricingMode: "direct", pricingInputValue: comparison.currentPrice }
                  : line;
              }) }));
              setMessage(`Текущие цены применены к выбранным позициям: ${checkedLineIds.size}. Сохраните смету.`);
              recordBehaviorInteraction({ eventName: "estimate_price_check_applied", route: "/cabinet/estimates/detail", sourceSurface: "estimate_editor" });
              setCommercialCheck(null);
            }}
            onKeep={() => {
              setCommercialCheck(null);
              setMessage("Сохранённые значения сметы оставлены без изменений.");
            }}
            onSelection={setCheckedLineIds}
          /></section> : null}
        <EstimateBulkToolbar
          dirty={dirty}
          disabled={!isDraft || pending}
          showConfidentialControls={!retailOnly}
          onClear={() => setSelectedLineIds(new Set())}
          onDiscount={(value) => applyBulkResult(applyBulkDiscount(draft.lines, selectedLineIds, value), "Скидка применена")}
          onMarkup={(value) => applyBulkResult(applyBulkMarkup(draft.lines, selectedLineIds, value), "Наценка применена")}
          onMove={(sectionId) => applyBulkResult(moveBulkLines(draft.lines, selectedLineIds, sectionId), "Позиции перемещены")}
          onQuantity={(value) => applyBulkResult(updateBulkQuantity(draft.lines, selectedLineIds, value), "Количество обновлено")}
          onRemove={() => mutate(() => removeEstimateLinesAction(estimate.id, [...selectedLineIds], estimate.revision))}
          onResetPrice={() => applyBulkResult(resetBulkToPartnerPrice(draft.lines, selectedLineIds), "Партнёрская цена восстановлена")}
          sections={draft.sections}
          selectedCount={selectedLineIds.size}
        />
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold uppercase text-emerald-700">Рабочая область</p><h2 className="mt-1 text-lg font-semibold">Разделы и позиции</h2></div><p className="text-xs text-zinc-500">{draft.lines.length} поз. · {draft.sections.length} разд.</p></div>
        {visibleSections.map((section) => {
          const sectionIndex = draft.sections.findIndex((item) => item.id === section.id);
          const sectionLines = draft.lines.filter((line) => line.sectionId === section.id);
          const visibleSectionLines = normalizedLineSearch ? sectionLines.filter((line) => `${line.sku ?? ""} ${line.description}`.toLocaleLowerCase("ru").includes(normalizedLineSearch)) : sectionLines;
          const sectionTotal = preview.value?.sectionTotals.find((item) => item.id === section.id);
          const isCollapsed = collapsed.has(section.id);
          return <section className="border-y border-zinc-200 bg-white" key={section.id}>
            <div className="grid items-center gap-2 border-b border-zinc-200 p-3 sm:grid-cols-[auto_auto_minmax(10rem,1fr)_7rem_auto_auto]">
              <button aria-expanded={!isCollapsed} aria-label="Свернуть раздел" className="p-2" onClick={() => setCollapsed((current) => toggleSet(current, section.id))} type="button">{isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}</button>
              <input aria-label={`Выбрать все позиции раздела ${section.name}`} checked={sectionLines.length > 0 && sectionLines.every((line) => selectedLineIds.has(line.id))} disabled={!isDraft || !sectionLines.length} onChange={(event) => setSelectedLineIds((current) => toggleMany(current, sectionLines.map((line) => line.id), event.target.checked))} type="checkbox" />
              <input aria-label="Название раздела" className={inputClass} disabled={!isDraft} onChange={(e) => update((d) => ({ ...d, sections: d.sections.map((item) => item.id === section.id ? { ...item, name: e.target.value } : item) }))} value={section.name} />
              <Field label="Скидка %"><NumberInput disabled={!isDraft} onValue={(value) => update((d) => ({ ...d, sections: d.sections.map((item) => item.id === section.id ? { ...item, discountPercent: value ?? 0 } : item) }))} value={section.discountPercent} /></Field>
              <span className="text-right text-sm font-semibold">{money(sectionTotal?.total ?? 0, draft.currencyCode)}</span>
              <div className="flex items-center">
                <ReorderButtons disabled={!isDraft} down={sectionIndex === draft.sections.length - 1} onDown={() => update((d) => ({ ...d, sections: move(d.sections, sectionIndex, sectionIndex + 1) }))} onUp={() => update((d) => ({ ...d, sections: move(d.sections, sectionIndex, sectionIndex - 1) }))} up={sectionIndex === 0} />
                <button aria-label={`Удалить раздел ${section.name}`} className="inline-flex size-10 items-center justify-center text-red-700 disabled:text-zinc-300" disabled={!isDraft || estimate.sections.some((item) => item.id === section.id) || sectionLines.length > 0 || draft.sections.length === 1} onClick={() => update((d) => ({ ...d, sections: d.sections.filter((item) => item.id !== section.id) }))} title={estimate.sections.some((item) => item.id === section.id) ? "Сохранённые разделы нельзя удалить в этой версии" : sectionLines.length ? "Сначала переместите или удалите позиции раздела" : draft.sections.length === 1 ? "В смете должен остаться хотя бы один раздел" : "Удалить пустой раздел"} type="button"><Trash2 className="size-4" /></button>
              </div>
            </div>
            {!isCollapsed && <div className="divide-y divide-zinc-100">{visibleSectionLines.length ? visibleSectionLines.map((line) => {
              const lineIndex = draft.lines.findIndex((item) => item.id === line.id);
              const sectionLineIndex = sectionLines.findIndex((item) => item.id === line.id);
              const calculated = preview.value?.lines.find((item) => item.id === line.id);
              const costMissing = line.convertedCostUnitPrice == null || line.convertedCostUnitPrice <= 0;
              return <div className="space-y-3 p-3" key={line.id}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-12 lg:items-end">
                  <input aria-label={`Выбрать позицию ${lineIndex + 1}`} checked={selectedLineIds.has(line.id)} className="mb-2 self-end lg:col-span-1" disabled={!isDraft} onChange={(event) => setSelectedLineIds((current) => toggleMany(current, [line.id], event.target.checked))} type="checkbox" />
                  <span className="self-end pb-2 text-sm text-zinc-500 lg:col-span-1">{lineIndex + 1}</span>
                  <div className={`${line.lineType === "product" ? "grid grid-cols-[3rem_minmax(0,1fr)] gap-2" : ""} col-span-2 min-w-0 sm:col-span-4 lg:col-span-4`}>
                    {line.lineType === "product" && <ProductLineThumbnail imageUrl={line.imageUrl ?? null} productName={line.description} size="compact" />}
                    <Field label="Описание"><div className="mb-1 flex flex-wrap items-center gap-2"><span className={lineTypeTone(line.lineType)}>{lineTypeLabel(line.lineType)}</span>{line.sku && <span className="text-[10px] text-zinc-500">SKU {line.sku}</span>}</div><input aria-describedby={line.lineType === "custom" || line.lineType === "external" ? `manual-line-${line.id}` : undefined} className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => updateLine(draft, setDraft, setDirty, line.id, { description: e.target.value })} required={line.lineType === "custom" || line.lineType === "external"} value={line.description} />{line.lineType === "custom" || line.lineType === "external" ? <p className="mt-1 text-xs text-amber-800" id={`manual-line-${line.id}`}>{line.lineType === "external" ? "Внешняя позиция не связана с каталогом Novotech или 1С." : "Ручная позиция не связана с каталогом. Проверьте описание и цену."}</p> : line.lineType === "product" ? <p className="mt-1 text-xs text-zinc-500">Цена сохранена в смете; наличие будет проверено перед заказом.</p> : null}</Field>
                  </div>
                  <Field className="lg:col-span-1" label="Кол-во"><NumberInput disabled={!isDraft} onValue={(value) => updateLine(draft, setDraft, setDirty, line.id, { quantity: value ?? 0 })} value={line.quantity} /></Field>
                  <Field className="lg:col-span-1" label="Ед."><select className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => updateLine(draft, setDraft, setDirty, line.id, { unit: e.target.value as EstimateUnit })} value={line.unit}>{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></Field>
                  <Field className="lg:col-span-1" label={line.pricingMode === "direct" ? "Цена" : line.pricingMode === "markup" ? "Наценка %" : "Маржа %"}><NumberInput disabled={!isDraft} nullable onValue={(value) => updateLine(draft, setDraft, setDirty, line.id, { pricingInputValue: value })} value={line.pricingInputValue} /></Field>
                  <Field className="lg:col-span-1" label="Скидка %"><NumberInput disabled={!isDraft} onValue={(value) => updateLine(draft, setDraft, setDirty, line.id, { lineDiscountPercent: value ?? 0 })} value={line.lineDiscountPercent} /></Field>
                  <div className="min-w-0 lg:col-span-1"><p className="text-xs font-medium text-zinc-500">Итого</p><p className="truncate pb-2 pt-2 text-sm font-semibold" title={calculated?.lineTotal === null || calculated?.lineTotal === undefined ? "Цена не задана" : money(calculated.lineTotal, draft.currencyCode)}>{calculated?.lineTotal === null || calculated?.lineTotal === undefined ? "Цена не задана" : money(calculated.lineTotal, draft.currencyCode)}</p></div>
                  <div className="flex justify-end lg:col-span-1"><ReorderButtons disabled={!isDraft} down={sectionLineIndex === sectionLines.length - 1} onDown={() => update((d) => ({ ...d, lines: moveLineWithinSection(d.lines, line.id, 1) }))} onUp={() => update((d) => ({ ...d, lines: moveLineWithinSection(d.lines, line.id, -1) }))} up={sectionLineIndex === 0} /><button aria-label="Удалить позицию" className="p-2 text-red-700" disabled={!isDraft || dirty} onClick={() => mutate(() => removeEstimateLineAction(estimate.id, line.id, estimate.revision))} type="button"><Trash2 className="size-4" /></button></div>
                </div>
                {!retailOnly ? <details className="rounded-md bg-zinc-50 px-3 py-2 text-sm"><summary className="cursor-pointer font-medium">Коммерческие детали</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="Режим"><select className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => updateLine(draft, setDraft, setDirty, line.id, { pricingMode: e.target.value as EstimatePricingMode })} value={line.pricingMode}>{pricingModes.map((mode) => <option disabled={costMissing && mode.value !== "direct"} key={mode.value} value={mode.value}>{mode.label}</option>)}</select></Field>
                  <Field label="Внутренняя себестоимость"><NumberInput disabled={!isDraft || line.lineType === "product"} nullable onValue={(value) => updateLine(draft, setDraft, setDirty, line.id, { internalCostUnitPrice: value, convertedCostUnitPrice: value })} value={line.internalCostUnitPrice ?? null} /></Field>
                  <Info label="Источник" value={line.sourcePrice ?? "—"} /><Info label="Наценка" value={percent(calculated?.markupPercent)} /><Info label="Маржа" value={percent(calculated?.marginPercent)} />
                  {costMissing && <p className="text-xs text-amber-800 sm:col-span-2">Нет исходной цены для расчёта.</p>}
                  <Field label="Раздел"><select className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => updateLine(draft, setDraft, setDirty, line.id, { sectionId: e.target.value })} value={line.sectionId}>{draft.sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Info label="Курс" value={line.exchangeRate ? `${line.exchangeRate} · ${line.exchangeRateEffectiveDate ?? ""}` : "—"} />
                </div></details> : null}
              </div>;
            }) : <p className="p-5 text-sm text-zinc-500">{normalizedLineSearch ? "В разделе нет позиций по этому запросу." : "В разделе пока нет позиций."}</p>}<div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-3 py-2"><span className="text-xs text-zinc-500">Подытог раздела: <strong className="text-zinc-800">{money(sectionTotal?.total ?? 0, draft.currencyCode)}</strong></span>{isDraft ? <button className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" disabled={dirty} onClick={() => openPickerForSection(section.id)} type="button"><Plus className="size-4" />Добавить позицию в раздел</button> : null}</div></div>}
          </section>;
        })}
        {!visibleSections.length ? <p className="border-y border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500">Раздел не найден. Сбросьте фильтр.</p> : null}
        {isDraft ? <button className={`${buttonClass} w-full border-dashed`} onClick={() => update((d) => ({ ...d, sections: [...d.sections, { id: crypto.randomUUID(), name: "Новый раздел", sortOrder: d.sections.length, showSubtotal: true, discountPercent: 0 }] }))} type="button"><Plus className="size-4" />Добавить раздел</button> : null}
        <Charges draft={draft} disabled={!isDraft} update={update} />
      </main>
      <aside className="min-w-0 border-y border-zinc-200 bg-white p-5 xl:sticky xl:top-24"><Summary currency={draft.currencyCode} preview={preview.value} retailOnly={retailOnly} sections={draft.sections} /><EstimateProposalSidebar disabled={dirty} revision={estimate.revision} workflow={workflow} /></aside>
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

function PriceCheckPanel({ check, checkedLineIds, onSelection, onApply, onKeep }: { check: EstimateCommercialCheckDto; checkedLineIds: Set<string>; onSelection: (ids: Set<string>) => void; onApply: () => void; onKeep: () => void }) {
  return <div className="mt-4 border-t border-zinc-200 pt-4"><p className="text-xs text-zinc-500">Проверено {new Date(check.checkedAt).toLocaleString("ru-RU")}. Предыдущее состояние склада в draft не фиксировалось.</p><div className="mt-3 divide-y divide-zinc-100">{check.lines.map((line) => <label className="grid min-h-16 gap-2 py-3 sm:grid-cols-[auto_minmax(10rem,1fr)_10rem_10rem] sm:items-center" key={line.lineId}><input checked={checkedLineIds.has(line.lineId)} disabled={line.currentPrice === null} onChange={(event) => { const next = new Set(checkedLineIds); if (event.target.checked) next.add(line.lineId); else next.delete(line.lineId); onSelection(next); }} type="checkbox" /><span className="min-w-0"><strong className="block truncate text-sm">{line.description}</strong><span className="text-xs text-zinc-500">{line.sku ? `SKU ${line.sku}` : "Без SKU"}</span></span><span className="text-sm"><span className="block text-xs text-zinc-500">Цена в смете → текущая</span>{formatNullableMoney(line.oldPrice, line.currencyCode)} → {formatNullableMoney(line.currentPrice, line.currencyCode)}</span><span className="text-sm"><span className="block text-xs text-zinc-500">Сейчас</span>{line.currentStock}{line.currentArrival ? ` · ${line.currentArrival}` : ""}</span></label>)}</div><div className="mt-4 flex flex-wrap justify-end gap-2"><button className={buttonClass} onClick={onKeep} type="button">Оставить значения сметы</button><button className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={!checkedLineIds.size} onClick={onApply} type="button">Применить выбранные цены</button></div></div>;
}

function Charges({ draft, disabled, update }: { draft: Draft; disabled: boolean; update: (next: (draft: Draft) => Draft) => void }) {
  return <section className="border-y border-zinc-200 bg-white p-4"><div className="flex justify-between"><h2 className="font-semibold">Дополнительные начисления</h2><button className={buttonClass} disabled={disabled} onClick={() => update((d) => ({ ...d, charges: [...d.charges, { id: crypto.randomUUID(), chargeType: "delivery", description: "Доставка", amount: 0, vatApplicable: true, customerVisible: true, sortOrder: d.charges.length }] }))} type="button"><Plus className="size-4" />Добавить</button></div><div className="mt-3 space-y-2">{draft.charges.map((charge) => <div className="grid gap-2 sm:grid-cols-[10rem_minmax(10rem,1fr)_8rem_auto_auto]" key={charge.id}><select className={inputClass} disabled={disabled} onChange={(e) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, chargeType: e.target.value as EstimateChargeType } : item) }))} value={charge.chargeType}>{chargeTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><input className={inputClass} disabled={disabled} onChange={(e) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, description: e.target.value } : item) }))} value={charge.description} /><NumberInput disabled={disabled} onValue={(value) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, amount: value ?? 0 } : item) }))} value={charge.amount} /><label className="flex items-center gap-2 text-xs"><input checked={charge.vatApplicable} disabled={disabled} onChange={(e) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, vatApplicable: e.target.checked } : item) }))} type="checkbox" />НДС</label><button aria-label="Удалить начисление" className={buttonClass} disabled={disabled} onClick={() => update((d) => ({ ...d, charges: d.charges.filter((item) => item.id !== charge.id) }))} type="button"><Trash2 className="size-4" /></button></div>)}</div></section>;
}

function Summary({ currency, preview, retailOnly, sections }: { currency: string; preview: ReturnType<typeof calculateEstimateCommercials> | null; retailOnly: boolean; sections: Draft["sections"] }) {
  const rows = preview ? [["Скидки", -(preview.lineDiscountTotal + preview.sectionDiscountTotal + preview.globalDiscountAmount)], ["Начисления", preview.chargesTotal], ["Итого без НДС", preview.totalExcludingVat], ["НДС", preview.vatAmount]] as const : [];
  return <section aria-labelledby="estimate-summary-title"><p className="text-xs font-semibold uppercase text-zinc-500">КП / Итог</p><h2 className="mt-1 font-semibold text-zinc-950" id="estimate-summary-title">Коммерческий расчёт</h2><div className="mt-4 space-y-2">{sections.map((section) => <div className="flex justify-between gap-3 text-sm" key={section.id}><span className="min-w-0 truncate text-zinc-500" title={section.name}>{section.name}</span><span className="shrink-0">{money(preview?.sectionTotals.find((item) => item.id === section.id)?.total ?? 0, currency)}</span></div>)}{rows.map(([label, value]) => <div className="flex justify-between gap-3 text-sm" key={label}><span className="text-zinc-500">{label}</span><span>{money(value, currency)}</span></div>)}</div><div className="mt-4 border-t pt-4"><p className="text-xs font-medium text-zinc-500">К оплате</p><p className="mt-1 text-2xl font-semibold">{money(preview?.finalTotal ?? 0, currency)}</p>{!retailOnly ? <><p className="mt-3 text-sm text-zinc-500">Валовая прибыль: {preview?.grossProfit === null || preview?.grossProfit === undefined ? "—" : money(preview.grossProfit, currency)}</p><p className="text-sm text-zinc-500">Общая маржа: {percent(preview?.overallMarginPercent)}</p></> : null}{preview?.incompletePricing && <p className="mt-3 bg-amber-50 p-2 text-xs text-amber-900">Есть позиции без рассчитанной цены.</p>}</div></section>;
}

function CurrencyDialog({ current, target, rate, effectiveDate, affectedLines, manualLines, onCancel, onConfirm }: { current: string; target: string; rate: number | null; effectiveDate: string | null; affectedLines: number; manualLines: number; onCancel: () => void; onConfirm: (policy: EstimateCurrencyChangePolicy) => void }) {
  return <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog"><div className="w-full max-w-lg rounded-md bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold">Смена валюты</h2><dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><dt>Валюта</dt><dd>{current} → {target}</dd><dt>Курс USD/MDL</dt><dd>{rate ?? "Недоступен"}</dd><dt>Дата курса</dt><dd>{effectiveDate ?? "—"}</dd><dt>Позиций</dt><dd>{affectedLines}</dd><dt>Ручных цен</dt><dd>{manualLines}</dd></dl><p className="mt-4 text-sm text-zinc-600">Изменение применяется атомарно при сохранении.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button className={buttonClass} onClick={onCancel} type="button">Отмена</button><button className={buttonClass} disabled={!rate} onClick={() => onConfirm("preserve_manual")} type="button">Сохранить ручные цены</button><button className="h-9 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-45" disabled={!rate} onClick={() => onConfirm("convert_all")} type="button">Конвертировать все</button></div></div></div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`min-w-0 text-xs font-medium text-zinc-600 ${className}`}><span className="mb-1 block">{label}</span>{children}</label>; }
function Meta({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="sr-only">{label}</dt><dd className="max-w-56 truncate" title={`${label}: ${value}`}><span className="text-zinc-400">{label}:</span> {value}</dd></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-sm">{value}</p></div>; }
function NumberInput({ value, onValue, disabled, nullable = false }: { value: number | null; onValue: (value: number | null) => void; disabled?: boolean; nullable?: boolean }) { return <input className={`${inputClass} w-full`} disabled={disabled} min="0" onChange={(event) => onValue(event.target.value === "" ? (nullable ? null : 0) : Number(event.target.value))} step="0.01" type="number" value={value ?? ""} />; }
function ReorderButtons({ onUp, onDown, up, down, disabled }: { onUp: () => void; onDown: () => void; up: boolean; down: boolean; disabled: boolean }) { return <span className="flex"><button aria-label="Переместить вверх" className="p-2" disabled={disabled || up} onClick={onUp} type="button"><ArrowUp className="size-4" /></button><button aria-label="Переместить вниз" className="p-2" disabled={disabled || down} onClick={onDown} type="button"><ArrowDown className="size-4" /></button></span>; }
function toDraft(estimate: EstimateDetailDto): Draft { return { name: estimate.name, finalCustomerId: estimate.finalCustomerId ?? null, customerName: estimate.customerName, projectName: estimate.projectName, validityDays: estimate.validityDays, currencyCode: estimate.currencyCode, vatMode: estimate.vatMode, vatRatePercent: estimate.vatRatePercent, globalDiscountPercent: estimate.globalDiscountPercent, sections: estimate.sections.map(({ id, name, sortOrder, showSubtotal, discountPercent }) => ({ id, name, sortOrder, showSubtotal, discountPercent })), lines: estimate.lines.map((item) => ({ ...item })), charges: estimate.charges.map((item) => ({ ...item })) }; }
function updateLine(draft: Draft, setDraft: React.Dispatch<React.SetStateAction<Draft>>, setDirty: (value: boolean) => void, id: string, patch: Partial<Draft["lines"][number]>) { setDraft({ ...draft, lines: draft.lines.map((line) => line.id === id ? { ...line, ...patch } : line) }); setDirty(true); }
function toggleSet(current: Set<string>, value: string) { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }
function toggleMany(current: Set<string>, values: string[], selected: boolean) { const next = new Set(current); for (const value of values) { if (selected) next.add(value); else next.delete(value); } return next; }
function lineTypeLabel(value: EstimateDetailDto["lines"][number]["lineType"]) { return value === "product" ? "Оборудование" : value === "service" ? "Работа / услуга" : value === "external" ? "Внешняя позиция" : "Ручная позиция"; }
function lineTypeTone(value: EstimateDetailDto["lines"][number]["lineType"]) { return `rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${value === "product" ? "bg-emerald-50 text-emerald-800" : value === "service" ? "bg-blue-50 text-blue-800" : "bg-amber-100 text-amber-900"}`; }
function vatModeLabel(mode: EstimateVatMode) { return mode === "included" ? "НДС включён" : mode === "separate" ? "НДС отдельно" : mode === "excluded" ? "без НДС" : "НДС не применяется"; }
function move<T>(values: T[], from: number, to: number): T[] { if (to < 0 || to >= values.length) return values; const next = [...values]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }
function moveLineWithinSection(lines: Draft["lines"], lineId: string, direction: -1 | 1) { const currentIndex = lines.findIndex((line) => line.id === lineId); if (currentIndex < 0) return lines; const sameSection = lines.filter((line) => line.sectionId === lines[currentIndex].sectionId); const sectionIndex = sameSection.findIndex((line) => line.id === lineId); const target = sameSection[sectionIndex + direction]; if (!target) return lines; const targetIndex = lines.findIndex((line) => line.id === target.id); const next = [...lines]; [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]]; return next; }
function money(value: number, currency: string) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value); }
function formatNullableMoney(value: number | null, currency: string) { return value === null ? "Цена уточняется" : money(value, currency); }
function percent(value: number | null | undefined) { return value === null || value === undefined ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`; }
