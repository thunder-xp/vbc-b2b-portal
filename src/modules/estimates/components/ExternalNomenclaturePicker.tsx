"use client";

import { Check, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { addEstimateExternalLineAction, searchExternalNomenclatureAction } from "../actions/estimate.actions";
import type { EstimateDetailDto, ExternalNomenclatureDto } from "../services";
import type { EstimateUnit } from "../types";

const inputClass = "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:bg-zinc-100";
const units: Array<{ value: EstimateUnit; label: string }> = [
  { value: "pcs", label: "шт." }, { value: "meter", label: "метр" },
  { value: "set", label: "комплект" }, { value: "service", label: "услуга" },
];

export function ExternalNomenclaturePicker({ estimate, disabled, onResult }: {
  estimate: EstimateDetailDto;
  disabled: boolean;
  onResult: (next: EstimateDetailDto, message: string) => void;
}) {
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [name, setName] = useState("");
  const [matches, setMatches] = useState<ExternalNomenclatureDto[]>([]);
  const [selected, setSelected] = useState<ExternalNomenclatureDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searchSequence = useRef(0);
  const requestKey = useRef(crypto.randomUUID());

  useEffect(() => {
    const identityQuery = [manufacturer, model].map((value) => value.trim()).filter(Boolean).join(" ");
    const query = identityQuery || name.trim();
    if (selected || query.length < 2) return;
    const sequence = ++searchSequence.current;
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchExternalNomenclatureAction(query);
        if (sequence !== searchSequence.current) return;
        if (result.success) setMatches(result.data);
        else setMessage(result.message);
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [manufacturer, model, name, selected]);

  const choose = (item: ExternalNomenclatureDto) => {
    setSelected(item);
    setManufacturer(item.manufacturer);
    setModel(item.model);
    setName(item.name);
    setMatches([]);
    requestKey.current = crypto.randomUUID();
  };

  const clearSelection = () => {
    setSelected(null);
    requestKey.current = crypto.randomUUID();
  };

  const submit = (form: HTMLFormElement, forceCreateNew: boolean) => {
    const data = new FormData(form);
    startTransition(async () => {
      const result = await addEstimateExternalLineAction(estimate.id, {
        expectedRevision: estimate.revision,
        existingExternalItemId: forceCreateNew ? null : selected?.id ?? null,
        manufacturer,
        model,
        name,
        category: String(data.get("category") ?? ""),
        unit: String(data.get("unit") ?? "pcs") as EstimateUnit,
        specification: String(data.get("specification") ?? ""),
        quantity: Number(data.get("quantity")),
        sellingUnitPrice: Number(data.get("price")),
        forceCreateNew,
        requestKey: requestKey.current,
      });
      setMessage(result.message);
      if (result.success) {
        requestKey.current = crypto.randomUUID();
        onResult(result.data, result.message);
      }
    });
  };

  return <form className="mt-4 space-y-3" onChange={() => { requestKey.current = crypto.randomUUID(); }} onSubmit={(event) => {
    event.preventDefault();
    if (!disabled) submit(event.currentTarget, false);
  }}>
    <div className="grid gap-2 md:grid-cols-3">
      <label className="text-xs font-medium text-zinc-600">Производитель<input className={`${inputClass} mt-1 w-full`} disabled={disabled || Boolean(selected)} maxLength={120} onChange={(event) => { searchSequence.current += 1; setMatches([]); setManufacturer(event.target.value); setSelected(null); }} required value={manufacturer} /></label>
      <label className="text-xs font-medium text-zinc-600">Модель<input className={`${inputClass} mt-1 w-full`} disabled={disabled || Boolean(selected)} maxLength={160} onChange={(event) => { searchSequence.current += 1; setMatches([]); setModel(event.target.value); setSelected(null); }} required value={model} /></label>
      <label className="text-xs font-medium text-zinc-600">Название<input className={`${inputClass} mt-1 w-full`} disabled={disabled || Boolean(selected)} maxLength={300} onChange={(event) => { searchSequence.current += 1; setMatches([]); setName(event.target.value); setSelected(null); }} required value={name} /></label>
    </div>

    {selected && <div className="flex flex-wrap items-center justify-between gap-2 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><span className="inline-flex items-center gap-2"><Check className="size-4" />Выбрана общая позиция: {selected.manufacturer} {selected.model}</span><button className="font-semibold underline" onClick={clearSelection} type="button">Создать другую</button></div>}
    {!selected && matches.length > 0 && <div className="border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-950">Похожая позиция уже существует в системе. Выберите существующую позицию, чтобы не создавать дубликат.</p>
      <div className="mt-2 grid gap-2">{matches.map((item) => <button aria-label={`Выбрать ${item.manufacturer} ${item.model}`} className="flex min-h-11 items-center justify-between gap-3 border border-amber-200 bg-white px-3 text-left text-sm" key={item.id} onClick={() => choose(item)} type="button"><span><strong>{item.manufacturer} {item.model}</strong><span className="block text-xs text-zinc-600">{item.name}{item.category ? ` · ${item.category}` : ""}</span></span><span className="font-semibold text-emerald-700">Выбрать</span></button>)}</div>
    </div>}

    <div className="grid gap-2 md:grid-cols-[minmax(10rem,1fr)_9rem_7rem_8rem]">
      <input aria-label="Категория внешней позиции" className={inputClass} defaultValue={selected?.category ?? ""} disabled={disabled || Boolean(selected)} maxLength={160} name="category" placeholder="Категория (необязательно)" />
      <select aria-label="Единица измерения" className={inputClass} defaultValue={selected?.unit ?? "pcs"} disabled={disabled || Boolean(selected)} name="unit">{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select>
      <input aria-label="Количество" className={inputClass} defaultValue="1" disabled={disabled} min="0.001" name="quantity" required step="0.001" type="number" />
      <input aria-label="Цена" className={inputClass} disabled={disabled} min="0" name="price" placeholder="Цена" required step="0.01" type="number" />
    </div>
    <textarea aria-label="Спецификация внешней позиции" className={`${inputClass} min-h-20 w-full py-2`} defaultValue={selected?.specification ?? ""} disabled={disabled || Boolean(selected)} maxLength={2000} name="specification" placeholder="Примечание или спецификация (необязательно)" />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p aria-live="polite" className="text-sm text-zinc-600">{pending ? <span className="inline-flex items-center gap-2"><Search className="size-4" />Проверка общей библиотеки...</span> : message}</p>
      <div className="flex flex-wrap gap-2">
        {!selected && matches.length > 0 && <button className="min-h-11 border border-zinc-300 bg-white px-3 text-sm font-semibold" disabled={disabled || pending} onClick={(event) => submit(event.currentTarget.form!, true)} type="button">Всё равно создать новую позицию</button>}
        <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={disabled || pending || (!selected && matches.length > 0)} type="submit"><Plus className="size-4" />{selected ? "Добавить выбранную" : "Создать и добавить"}</button>
      </div>
    </div>
  </form>;
}
