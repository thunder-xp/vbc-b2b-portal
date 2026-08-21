"use client";

import { Check, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { addEstimateExternalLineAction, searchExternalNomenclatureAction } from "../actions/estimate.actions";
import type { ExternalNomenclatureItemType } from "../repositories";
import type { EstimateDetailDto, ExternalNomenclatureDto } from "../services";
import type { EstimateUnit } from "../types";
import { NomenclatureCover } from "./NomenclatureCover";
import { getEstimatesCopy, usePartnerLocale, type PartnerLocale } from "../../partner-locale";

const inputClass = "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:bg-zinc-100";
const units: EstimateUnit[] = ["pcs", "meter", "set", "service"];

export function ExternalNomenclaturePicker({ estimate, disabled, itemType, onResult, targetSectionId }: {
  estimate: EstimateDetailDto;
  disabled: boolean;
  itemType: ExternalNomenclatureItemType;
  onResult: (next: EstimateDetailDto, message: string) => void;
  targetSectionId: string;
}) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const isService = itemType === "service";
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"own" | "shared">("own");
  const [matches, setMatches] = useState<ExternalNomenclatureDto[]>([]);
  const [selected, setSelected] = useState<ExternalNomenclatureDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searchSequence = useRef(0);
  const requestKey = useRef(crypto.randomUUID());

  useEffect(() => {
    const identityQuery = isService ? name.trim() : [manufacturer, model].map((value) => value.trim()).filter(Boolean).join("") || name.trim();
    if (selected || identityQuery.length < 2) return;
    const sequence = ++searchSequence.current;
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchExternalNomenclatureAction({ query: identityQuery, itemType, scope });
        if (sequence !== searchSequence.current) return;
        if (result.success) setMatches(result.data);
        else setMessage(copy.operationFailed);
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [copy.operationFailed, isService, itemType, manufacturer, model, name, scope, selected]);

  const choose = (item: ExternalNomenclatureDto) => {
    setSelected(item);
    setManufacturer(item.manufacturer ?? "");
    setModel(item.model ?? "");
    setName(item.name);
    setMatches([]);
    requestKey.current = crypto.randomUUID();
  };

  const resetSearch = () => {
    searchSequence.current += 1;
    setMatches([]);
    setSelected(null);
    requestKey.current = crypto.randomUUID();
  };

  const submit = (form: HTMLFormElement, forceCreateNew: boolean) => {
    const data = new FormData(form);
    startTransition(async () => {
      const result = await addEstimateExternalLineAction(estimate.id, {
        expectedRevision: estimate.revision,
        targetSectionId,
        existingExternalItemId: forceCreateNew ? null : selected?.id ?? null,
        manufacturer: isService ? null : manufacturer,
        model: isService ? null : model,
        name,
        category: String(data.get("category") ?? ""),
        unit: String(data.get("unit") ?? (isService ? "service" : "pcs")) as EstimateUnit,
        specification: String(data.get("specification") ?? ""),
        quantity: Number(data.get("quantity")),
        sellingUnitPrice: Number(data.get("price")),
        forceCreateNew,
        requestKey: requestKey.current,
      });
      setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);
      if (result.success) {
        requestKey.current = crypto.randomUUID();
        onResult(result.data, copy.operationSucceeded);
      }
    });
  };

  return <form className="mt-4 space-y-3" onChange={() => { requestKey.current = crypto.randomUUID(); }} onSubmit={(event) => {
    event.preventDefault();
    if (!disabled) submit(event.currentTarget, false);
  }}>
    <div className={`grid gap-2 ${isService ? "md:grid-cols-1" : "md:grid-cols-3"}`}>
      {!isService && <label className="text-xs font-medium text-zinc-600">{copy.manufacturer}<input className={`${inputClass} mt-1 w-full`} disabled={disabled || Boolean(selected)} id="estimate-external-manufacturer" maxLength={120} onChange={(event) => { resetSearch(); setManufacturer(event.target.value); }} required value={manufacturer} /></label>}
      {!isService && <label className="text-xs font-medium text-zinc-600">{copy.model}<input className={`${inputClass} mt-1 w-full`} disabled={disabled || Boolean(selected)} maxLength={160} onChange={(event) => { resetSearch(); setModel(event.target.value); }} required value={model} /></label>}
      <label className="text-xs font-medium text-zinc-600">{copy.itemName}<input className={`${inputClass} mt-1 w-full`} disabled={disabled || Boolean(selected)} id={isService ? "estimate-external-name" : undefined} maxLength={300} onChange={(event) => { resetSearch(); setName(event.target.value); }} required value={name} /></label>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
      <span>{scope === "own" ? copy.ownNomenclatureSearch : copy.sharedNomenclatureSearch}</span>
      <button className="min-h-11 font-semibold text-emerald-700 underline" onClick={() => { resetSearch(); setScope((current) => current === "own" ? "shared" : "own"); }} type="button">{scope === "own" ? copy.expandSearch : copy.ownSearchOnly}</button>
    </div>

    {selected && <div className="flex flex-wrap items-center justify-between gap-2 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><span className="inline-flex items-center gap-2"><Check className="size-4" />{copy.selectedPosition}: {[selected.manufacturer, selected.model, selected.name].filter(Boolean).join(" · ")}</span><button className="font-semibold underline" onClick={resetSearch} type="button">{copy.createAnother}</button></div>}
    {!selected && matches.length > 0 && <div className="border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-950">{copy.similarPositions}</p>
      <div className="mt-2 grid gap-2">{matches.map((item) => <button aria-label={`${copy.select} ${[item.manufacturer, item.model, item.name].filter(Boolean).join(" ")}`} className="flex min-h-11 items-center justify-between gap-3 border border-amber-200 bg-white px-3 py-2 text-left text-sm" key={item.id} onClick={() => choose(item)} type="button"><span className="flex min-w-0 items-center gap-3"><NomenclatureCover hasCover={item.hasCover} itemId={item.id} name={item.name} size="sm" /><span className="min-w-0"><strong>{[item.manufacturer, item.model].filter(Boolean).join(" ") || item.name}</strong><span className="block text-xs text-zinc-600">{item.name}{item.category ? ` · ${item.category}` : ""} · {unitLabel(item.unit, locale)}</span></span></span><span className="font-semibold text-emerald-700">{copy.select}</span></button>)}</div>
    </div>}

    <div className="grid gap-2 md:grid-cols-[minmax(10rem,1fr)_9rem_7rem_8rem]">
      <input aria-label={copy.externalCategory} className={inputClass} defaultValue={selected?.category ?? ""} disabled={disabled || Boolean(selected)} maxLength={160} name="category" placeholder={copy.optionalCategory} />
      <select aria-label={copy.unitOfMeasure} className={inputClass} defaultValue={selected?.unit ?? (isService ? "service" : "pcs")} disabled={disabled || Boolean(selected)} name="unit">{units.map((unit) => <option key={unit} value={unit}>{unitLabel(unit, locale)}</option>)}</select>
      <input aria-label={copy.quantity} className={inputClass} defaultValue="1" disabled={disabled} min="0.001" name="quantity" required step="0.001" type="number" />
      <input aria-label={copy.price} className={inputClass} disabled={disabled} min="0" name="price" placeholder={copy.price} required step="0.01" type="number" />
    </div>
    <textarea aria-label={copy.externalDescription} className={`${inputClass} min-h-20 w-full py-2`} defaultValue={selected?.specification ?? ""} disabled={disabled || Boolean(selected)} maxLength={2000} name="specification" placeholder={copy.optionalDescription} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p aria-live="polite" className="text-sm text-zinc-600">{pending ? <span className="inline-flex items-center gap-2"><Search className="size-4" />{copy.searching}</span> : message}</p>
      <div className="flex flex-wrap gap-2">
        {!selected && matches.length > 0 && <button className="min-h-11 border border-zinc-300 bg-white px-3 text-sm font-semibold" disabled={disabled || pending} onClick={(event) => submit(event.currentTarget.form!, true)} type="button">{copy.forceCreate}</button>}
        <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={disabled || pending || (!selected && matches.length > 0)} type="submit"><Plus className="size-4" />{selected ? copy.addSelectedPosition : copy.createAndAdd}</button>
      </div>
    </div>
  </form>;
}

function unitLabel(unit: EstimateUnit, locale: PartnerLocale) {
  return ({ pcs: ["шт.", "buc."], meter: ["метр", "metru"], set: ["комплект", "set"], hour: ["час", "oră"], visit: ["выезд", "deplasare"], service: ["услуга", "serviciu"] } as const)[unit][locale === "ro" ? 1 : 0];
}
