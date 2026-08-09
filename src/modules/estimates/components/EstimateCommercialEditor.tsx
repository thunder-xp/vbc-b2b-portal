"use client";

import { ChevronDown, ChevronRight, MoreHorizontal, Plus, RotateCcw, Save, SaveAll, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { ProductLineThumbnail } from "../../catalog/components/ProductLineThumbnail";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import {
  checkEstimateCommercialStateAction,
  removeEstimateLineAction,
  saveEstimateCommercialAction,
} from "../actions/estimate.actions";
import { calculateEstimateCommercials, EstimateCalculationError, resolveCurrencyRate } from "../services/commercial-calculation";
import type { EstimateCommercialCheckDto, EstimateCommercialOptionsDto, EstimateDetailDto, EstimateServiceDto, SaveEstimateCommercialCommand } from "../services";
import { CANONICAL_ESTIMATE_SECTION_BY_KEY, canonicalSectionOrder } from "../services/estimate-sections";
import type { EstimateChargeType, EstimateCurrencyChangePolicy, EstimateUnit, EstimateVatMode, EstimateWorkflowDto } from "../types";
import { EstimateStatusBadge } from "./EstimateStatusBadge";
import { EstimateLinePicker, type EstimateLinePickerMode } from "./EstimateLinePicker";
import { EstimateProposalSidebar } from "./EstimateProposalSidebar";
import { FinalCustomerPicker } from "./FinalCustomerPicker";

const inputClass = "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:bg-zinc-100";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
const units: Array<{ value: EstimateUnit; label: string }> = [
  { value: "pcs", label: "шт." }, { value: "hour", label: "час" }, { value: "meter", label: "метр" },
  { value: "set", label: "комплект" }, { value: "visit", label: "выезд" }, { value: "service", label: "услуга" },
];
const chargeTypes: Array<{ value: EstimateChargeType; label: string }> = [
  { value: "delivery", label: "Доставка" }, { value: "installation", label: "Монтаж" },
  { value: "commissioning", label: "Пусконаладка" }, { value: "transport", label: "Транспорт" }, { value: "other", label: "Прочее" },
];

type Draft = Pick<EstimateDetailDto, "name" | "customerName" | "projectName" | "validityDays" | "currencyCode" | "vatMode" | "vatRatePercent" | "globalDiscountPercent" | "lines" | "charges"> & {
  finalCustomerId: string | null;
  sections: Array<Pick<EstimateDetailDto["sections"][number], "id" | "name" | "systemKey" | "sortOrder" | "showSubtotal" | "discountPercent">>;
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
  const [pickerMode, setPickerMode] = useState<EstimateLinePickerMode | null>(null);
  const [targetSectionId, setTargetSectionId] = useState(initialEstimate.sections[0]?.id ?? "");
  const [lineSearch, setLineSearch] = useState("");
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
  const draftReadiness = useMemo(() => {
    const invalidQuantityCount = draft.lines.filter((line) => !Number.isFinite(line.quantity) || line.quantity <= 0).length;
    const missingPriceCount = draft.lines.filter((line) => line.pricingInputValue === null || !Number.isFinite(line.pricingInputValue)).length;
    const checks = [
      { label: "Добавьте хотя бы одну позицию", passed: draft.lines.length > 0 },
      { label: invalidQuantityCount ? `У ${invalidQuantityCount} позиций указано некорректное количество` : "Количество по всем позициям указано", passed: invalidQuantityCount === 0 },
      { label: missingPriceCount ? `У ${missingPriceCount} позиций не указана цена` : "Цены по всем позициям указаны", passed: missingPriceCount === 0 },
      { label: "Валюта сметы определена", passed: /^[A-Z]{3}$/.test(draft.currencyCode) },
      { label: preview.error ?? "Коммерческий итог рассчитан", passed: preview.value !== null },
    ];
    return { ready: checks.every((check) => check.passed), checks };
  }, [draft.currencyCode, draft.lines, preview]);

  useEffect(() => {
    if (!dirty) return;
    const warning = "В смете есть несохранённые изменения. Покинуть страницу?";
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = warning; };
    const preventLinkNavigation = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || new URL(href, window.location.href).origin !== window.location.origin) return;
      if (!window.confirm(warning)) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", preventLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", preventLinkNavigation, true);
    };
  }, [dirty]);

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
    setTargetSectionId((current) => next.sections.some((section) => section.id === current) ? current : (next.sections[0]?.id ?? ""));
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
  const checkCommercialState = () => startCheck(async () => {
    recordBehaviorInteraction({ eventName: "estimate_price_check_started", route: "/cabinet/estimates/detail", sourceSurface: "estimate_editor" });
    const result = await checkEstimateCommercialStateAction(estimate.id);
    setMessage(result.message);
    if (result.success) {
      setCommercialCheck(result.data);
      setCheckedLineIds(new Set(result.data.lines.filter((line) => line.priceChanged && line.currentPrice !== null).map((line) => line.lineId)));
    }
  });
  const openPickerForSection = (sectionId: string, mode: EstimateLinePickerMode) => {
    setTargetSectionId(sectionId);
    setPickerMode(mode);
    requestAnimationFrame(() => document.getElementById("estimate-line-picker")?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  };
  const normalizedLineSearch = lineSearch.trim().toLocaleLowerCase("ru");
  const visibleSections = [...draft.sections].sort((left, right) => {
    const canonicalDifference = canonicalUiOrder(left) - canonicalUiOrder(right);
    return canonicalDifference || left.sortOrder - right.sortOrder;
  });

  return <div className="min-w-0 space-y-5" data-testid="estimate-workspace" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (dirty && !pending && isDraft && preview.value) save();
    }
  }}>
    <header className="sticky top-0 z-20 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:-mx-8 lg:px-8">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><Link className="text-xs font-semibold text-emerald-700" href="/cabinet/estimates" prefetch={false}>← Сметы и КП</Link><strong className="text-xs uppercase text-zinc-500">{estimate.estimateNumber}</strong><EstimateStatusBadge status={estimate.status === "archived" ? "archived" : estimate.lifecycleStatus} />{dirty && <span className="text-xs font-semibold text-amber-700">Не сохранено</span>}</div>
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
        <label className="relative block min-w-0"><span className="sr-only">Поиск по позициям сметы</span><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-400" /><input className={`${inputClass} w-full pl-9`} onChange={(event) => setLineSearch(event.target.value)} placeholder="Поиск по позициям" value={lineSearch} /></label>
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
        <div><h2 className="text-lg font-semibold">Смета</h2><p className="mt-1 text-xs text-zinc-500">{draft.lines.length} позиций</p></div>
        {visibleSections.map((section) => {
          const canonical = resolveCanonicalSection(section);
          const sectionLines = draft.lines.filter((line) => line.sectionId === section.id);
          const visibleSectionLines = normalizedLineSearch ? sectionLines.filter((line) => `${line.sku ?? ""} ${line.description}`.toLocaleLowerCase("ru").includes(normalizedLineSearch)) : sectionLines;
          const sectionTotal = preview.value?.sectionTotals.find((item) => item.id === section.id);
          const isCollapsed = collapsed.has(section.id);
          return <section className="border-y border-zinc-200 bg-white" key={section.id}>
            <div className="flex min-h-14 items-center gap-2 border-b border-zinc-200 px-3 py-2">
              <button aria-expanded={!isCollapsed} aria-label="Свернуть раздел" className="p-2" onClick={() => setCollapsed((current) => toggleSet(current, section.id))} type="button">{isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}</button>
              <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-zinc-950" title={section.name}>{section.name}</h3>{!canonical ? <p className="text-xs text-zinc-500">Исторический раздел</p> : null}</div>
              <strong className="shrink-0 text-sm">{money(sectionTotal?.total ?? 0, draft.currencyCode)}</strong>
            </div>
            {!isCollapsed && <div>
              {visibleSectionLines.length ? <div className="hidden grid-cols-[1.75rem_3rem_minmax(9rem,1fr)_4.25rem_4.5rem_5.25rem_4.75rem_5.5rem_2.75rem] gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-500 xl:grid" data-testid="estimate-line-header"><span>№</span><span>Фото</span><span>Позиция</span><span>Кол-во</span><span>Ед.</span><span>Цена</span><span>Скидка</span><span>Итого</span><span /></div> : null}
              <div className="divide-y divide-zinc-100">{visibleSectionLines.length ? visibleSectionLines.map((line) => {
              const lineIndex = draft.lines.findIndex((item) => item.id === line.id);
              const calculated = preview.value?.lines.find((item) => item.id === line.id);
              return <div className="p-3" data-line-type={line.lineType} data-testid="estimate-line-row" key={line.id}>
                <div className="grid grid-cols-[1.75rem_3rem_minmax(0,1fr)] items-start gap-2 xl:grid-cols-[1.75rem_3rem_minmax(9rem,1fr)_4.25rem_4.5rem_5.25rem_4.75rem_5.5rem_2.75rem]" data-testid="estimate-line-grid">
                  <span className="pt-3 text-sm text-zinc-500">{lineIndex + 1}</span>
                  <div className="flex size-12 items-center justify-center overflow-hidden rounded border border-zinc-200 bg-zinc-50">{line.lineType === "product" ? <ProductLineThumbnail imageUrl={line.imageUrl ?? null} productName={line.description} size="compact" /> : <span aria-hidden="true" className="size-12" />}</div>
                  <Field label="Позиция" labelClassName="xl:sr-only"><input className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => updateLine(draft, setDraft, setDirty, line.id, { description: e.target.value })} required={line.lineType === "custom" || line.lineType === "external"} title={line.description} value={line.description} /><div className="mt-1 flex min-h-4 flex-wrap items-center gap-2"><span className={lineTypeTone(line.lineType)}>{lineTypeLabel(line.lineType)}</span>{line.sku && <span className="text-[10px] text-zinc-500">SKU {line.sku}</span>}</div></Field>
                  <div className="col-span-3 grid grid-cols-2 gap-2 sm:grid-cols-5 xl:contents">
                    <Field label="Кол-во" labelClassName="xl:sr-only"><NumberInput disabled={!isDraft} onValue={(value) => updateLine(draft, setDraft, setDirty, line.id, { quantity: value ?? 0 })} value={line.quantity} /></Field>
                    <Field label="Ед." labelClassName="xl:sr-only"><select className={`${inputClass} w-full`} disabled={!isDraft} onChange={(e) => updateLine(draft, setDraft, setDirty, line.id, { unit: e.target.value as EstimateUnit })} value={line.unit}>{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></Field>
                    <Field label={line.pricingMode === "direct" ? "Цена" : line.pricingMode === "markup" ? "Наценка %" : "Маржа %"} labelClassName="xl:sr-only"><NumberInput disabled={!isDraft} nullable onValue={(value) => updateLine(draft, setDraft, setDirty, line.id, { pricingInputValue: value })} value={line.pricingInputValue} /></Field>
                    <Field label="Скидка %" labelClassName="xl:sr-only"><NumberInput disabled={!isDraft} onValue={(value) => updateLine(draft, setDraft, setDirty, line.id, { lineDiscountPercent: value ?? 0 })} value={line.lineDiscountPercent} /></Field>
                    <div className="min-w-0"><p className="text-xs font-medium text-zinc-500 xl:sr-only">Итого</p><p className="mt-3 truncate text-sm font-semibold xl:mt-3" title={calculated?.lineTotal === null || calculated?.lineTotal === undefined ? "Цена не задана" : money(calculated.lineTotal, draft.currencyCode)}>{calculated?.lineTotal === null || calculated?.lineTotal === undefined ? "Цена не задана" : money(calculated.lineTotal, draft.currencyCode)}</p></div>
                  </div>
                  <div className="col-span-3 flex min-h-11 items-center justify-end xl:col-span-1 xl:self-start"><button aria-label="Удалить позицию" className="inline-flex size-11 items-center justify-center text-red-700" disabled={!isDraft || dirty} onClick={() => mutate(() => removeEstimateLineAction(estimate.id, line.id, estimate.revision))} type="button"><Trash2 className="size-4" /></button></div>
                </div>
              </div>;
            }) : <p className="p-5 text-sm text-zinc-500">{normalizedLineSearch ? "В разделе нет позиций по этому запросу." : "В разделе пока нет позиций."}</p>}</div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-3 py-2"><span className="text-xs text-zinc-500">{canonical?.subtotalLabel ?? `Итого за ${section.name.toLocaleLowerCase("ru")}`}: <strong className="text-zinc-800">{money(sectionTotal?.total ?? 0, draft.currencyCode)}</strong></span>{isDraft && canonical ? <button className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" disabled={dirty} onClick={() => openPickerForSection(section.id, canonical.defaultMode)} type="button"><Plus className="size-4" />{canonical.addLabel}</button> : null}</div>
              {isDraft && canonical && targetSectionId === section.id && pickerMode ? <EstimateLinePicker allowedModes={canonical.allowedModes} contextLabel={canonical.name} disabled={dirty} estimate={estimate} mode={pickerMode} onModeChange={setPickerMode} onResult={acceptServer} services={services} targetSectionId={section.id} /> : null}
            </div>}
          </section>;
        })}
        {isDraft || draft.charges.length ? <details className="border-y border-zinc-200 bg-white"><summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">Дополнительные начисления</summary><Charges draft={draft} disabled={!isDraft} update={update} /></details> : null}
      </main>
      <aside className="min-w-0 border-y border-zinc-200 bg-white p-5 xl:sticky xl:top-24"><Summary currency={draft.currencyCode} preview={preview.value} sections={visibleSections} /><EstimateProposalSidebar disabled={dirty || pending} readiness={draftReadiness} revision={estimate.revision} workflow={workflow} /></aside>
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
  return <div className="border-t border-zinc-200 p-4"><div className="flex justify-end"><button className={buttonClass} disabled={disabled} onClick={() => update((d) => ({ ...d, charges: [...d.charges, { id: crypto.randomUUID(), chargeType: "delivery", description: "Доставка", amount: 0, vatApplicable: true, customerVisible: true, sortOrder: d.charges.length }] }))} type="button"><Plus className="size-4" />Добавить</button></div><div className="mt-3 space-y-2">{draft.charges.map((charge) => <div className="grid gap-2 sm:grid-cols-[10rem_minmax(10rem,1fr)_8rem_auto_auto]" key={charge.id}><select className={inputClass} disabled={disabled} onChange={(e) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, chargeType: e.target.value as EstimateChargeType } : item) }))} value={charge.chargeType}>{chargeTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><input className={inputClass} disabled={disabled} onChange={(e) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, description: e.target.value } : item) }))} value={charge.description} /><NumberInput disabled={disabled} onValue={(value) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, amount: value ?? 0 } : item) }))} value={charge.amount} /><label className="flex items-center gap-2 text-xs"><input checked={charge.vatApplicable} disabled={disabled} onChange={(e) => update((d) => ({ ...d, charges: d.charges.map((item) => item.id === charge.id ? { ...item, vatApplicable: e.target.checked } : item) }))} type="checkbox" />НДС</label><button aria-label="Удалить начисление" className={buttonClass} disabled={disabled} onClick={() => update((d) => ({ ...d, charges: d.charges.filter((item) => item.id !== charge.id) }))} type="button"><Trash2 className="size-4" /></button></div>)}</div></div>;
}

function Summary({ currency, preview, sections }: { currency: string; preview: ReturnType<typeof calculateEstimateCommercials> | null; sections: Draft["sections"] }) {
  const rows = preview ? [["Итого без НДС", preview.totalExcludingVat], ["НДС", preview.vatAmount]] as const : [];
  return <section aria-labelledby="estimate-summary-title"><p className="text-xs font-semibold uppercase text-zinc-500">КП / Итог</p><h2 className="mt-1 font-semibold text-zinc-950" id="estimate-summary-title">Коммерческий расчёт</h2><div className="mt-4 space-y-2">{sections.map((section) => { const canonical = resolveCanonicalSection(section); return <div className="flex justify-between gap-3 text-sm" key={section.id}><span className="min-w-0 truncate text-zinc-500" title={canonical?.subtotalLabel ?? section.name}>{canonical?.subtotalLabel ?? section.name}</span><span className="shrink-0">{money(preview?.sectionTotals.find((item) => item.id === section.id)?.total ?? 0, currency)}</span></div>; })}{rows.map(([label, value]) => <div className="flex justify-between gap-3 text-sm" key={label}><span className="text-zinc-500">{label}</span><span>{money(value, currency)}</span></div>)}</div><div className="mt-4 border-t pt-4"><p className="text-xs font-medium text-zinc-500">К оплате</p><p className="mt-1 text-2xl font-semibold">{money(preview?.finalTotal ?? 0, currency)}</p>{preview?.incompletePricing && <p className="mt-3 bg-amber-50 p-2 text-xs text-amber-900">Есть позиции без рассчитанной цены.</p>}</div></section>;
}

function CurrencyDialog({ current, target, rate, effectiveDate, affectedLines, manualLines, onCancel, onConfirm }: { current: string; target: string; rate: number | null; effectiveDate: string | null; affectedLines: number; manualLines: number; onCancel: () => void; onConfirm: (policy: EstimateCurrencyChangePolicy) => void }) {
  return <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog"><div className="w-full max-w-lg rounded-md bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold">Смена валюты</h2><dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><dt>Валюта</dt><dd>{current} → {target}</dd><dt>Курс USD/MDL</dt><dd>{rate ?? "Недоступен"}</dd><dt>Дата курса</dt><dd>{effectiveDate ?? "—"}</dd><dt>Позиций</dt><dd>{affectedLines}</dd><dt>Ручных цен</dt><dd>{manualLines}</dd></dl><p className="mt-4 text-sm text-zinc-600">Изменение применяется атомарно при сохранении.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button className={buttonClass} onClick={onCancel} type="button">Отмена</button><button className={buttonClass} disabled={!rate} onClick={() => onConfirm("preserve_manual")} type="button">Сохранить ручные цены</button><button className="h-9 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-45" disabled={!rate} onClick={() => onConfirm("convert_all")} type="button">Конвертировать все</button></div></div></div>;
}

function Field({ label, children, className = "", labelClassName = "" }: { label: string; children: React.ReactNode; className?: string; labelClassName?: string }) { return <label className={`min-w-0 text-xs font-medium text-zinc-600 ${className}`}><span className={`mb-1 block ${labelClassName}`}>{label}</span>{children}</label>; }
function Meta({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="sr-only">{label}</dt><dd className="max-w-56 truncate" title={`${label}: ${value}`}><span className="text-zinc-400">{label}:</span> {value}</dd></div>; }
function NumberInput({ value, onValue, disabled, nullable = false }: { value: number | null; onValue: (value: number | null) => void; disabled?: boolean; nullable?: boolean }) {
  const commit = (inputValue: string) => {
    const next = inputValue === "" ? (nullable ? null : 0) : Number(inputValue);
    if (next !== value) onValue(next);
  };
  return <input className={`${inputClass} w-full`} defaultValue={value ?? ""} disabled={disabled} key={value ?? "empty"} min="0" onBlur={(event) => commit(event.currentTarget.value)} onKeyDown={(event) => {
    if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
    if (event.key === "Escape") { event.preventDefault(); event.currentTarget.value = value === null ? "" : String(value); event.currentTarget.blur(); }
  }} step="0.01" type="number" />;
}
function toDraft(estimate: EstimateDetailDto): Draft { return { name: estimate.name, finalCustomerId: estimate.finalCustomerId ?? null, customerName: estimate.customerName, projectName: estimate.projectName, validityDays: estimate.validityDays, currencyCode: estimate.currencyCode, vatMode: estimate.vatMode, vatRatePercent: estimate.vatRatePercent, globalDiscountPercent: estimate.globalDiscountPercent, sections: estimate.sections.map(({ id, name, systemKey, sortOrder, showSubtotal, discountPercent }) => ({ id, name, systemKey: systemKey ?? null, sortOrder, showSubtotal, discountPercent })), lines: estimate.lines.map((item) => ({ ...item })), charges: estimate.charges.map((item) => ({ ...item })) }; }
function updateLine(draft: Draft, setDraft: React.Dispatch<React.SetStateAction<Draft>>, setDirty: (value: boolean) => void, id: string, patch: Partial<Draft["lines"][number]>) { setDraft({ ...draft, lines: draft.lines.map((line) => line.id === id ? { ...line, ...patch } : line) }); setDirty(true); }
function toggleSet(current: Set<string>, value: string) { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }
function lineTypeLabel(value: EstimateDetailDto["lines"][number]["lineType"]) { return value === "product" ? "Оборудование" : value === "service" ? "Работа / услуга" : value === "external" ? "Внешняя позиция" : "Ручная позиция"; }
function lineTypeTone(value: EstimateDetailDto["lines"][number]["lineType"]) { return `rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${value === "product" ? "bg-emerald-50 text-emerald-800" : value === "service" ? "bg-blue-50 text-blue-800" : "bg-amber-100 text-amber-900"}`; }
function vatModeLabel(mode: EstimateVatMode) { return mode === "included" ? "НДС включён" : mode === "separate" ? "НДС отдельно" : mode === "excluded" ? "без НДС" : "НДС не применяется"; }
function resolveCanonicalSection(section: Draft["sections"][number]) { return section.systemKey ? CANONICAL_ESTIMATE_SECTION_BY_KEY.get(section.systemKey) : [...CANONICAL_ESTIMATE_SECTION_BY_KEY.values()].find((candidate) => candidate.name === section.name); }
function canonicalUiOrder(section: Draft["sections"][number]) { const canonical = resolveCanonicalSection(section); return canonical ? canonicalSectionOrder(canonical.key) : Number.MAX_SAFE_INTEGER; }
function money(value: number, currency: string) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value); }
function formatNullableMoney(value: number | null, currency: string) { return value === null ? "Цена уточняется" : money(value, currency); }
