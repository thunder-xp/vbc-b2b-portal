"use client";

import { Archive, Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";

import { archivePartnerNomenclatureAction, createPartnerNomenclatureAction, updatePartnerNomenclatureAction } from "../actions";
import type { ExternalNomenclatureItemType } from "../repositories";
import type { PartnerNomenclatureDto, PartnerNomenclatureInput } from "../services";
import { externalNomenclatureItemTypeLabel } from "../services/external-nomenclature";
import type { EstimateUnit } from "../types";

const inputClass = "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:bg-zinc-100";
const units: Array<{ value: EstimateUnit; label: string }> = [
  { value: "pcs", label: "шт." },
  { value: "meter", label: "метр" },
  { value: "set", label: "комплект" },
  { value: "hour", label: "час" },
  { value: "visit", label: "выезд" },
  { value: "service", label: "услуга" },
];

export function PartnerNomenclatureWorkspace({ records }: { records: PartnerNomenclatureDto[] }) {
  const router = useRouter();
  const [createType, setCreateType] = useState<ExternalNomenclatureItemType>("equipment");
  const [message, setMessage] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [pending, startTransition] = useTransition();
  const createRequestKey = useRef(crypto.randomUUID());

  const run = (operation: () => Promise<{ success: boolean; message: string }>) => startTransition(async () => {
    const result = await operation();
    setMessage(result.message);
    if (result.success) router.refresh();
  });

  const create = (form: HTMLFormElement, forceCreateNew = false) => {
    const input = nomenclatureInput(new FormData(form), createType, createRequestKey.current, forceCreateNew);
    run(async () => {
      const result = await createPartnerNomenclatureAction(input);
      setDuplicateWarning(!result.success && result.message.includes("Похожая позиция"));
      if (result.success) {
        form.reset();
        createRequestKey.current = crypto.randomUUID();
      }
      return result;
    });
  };

  return <div className="space-y-5">
    <details className="border-y border-zinc-200 bg-white">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold"><Plus className="size-4 text-emerald-700" />Добавить позицию</summary>
      <form className="grid min-w-0 gap-3 border-t border-zinc-200 p-4 sm:grid-cols-2 xl:grid-cols-3" onChange={() => { createRequestKey.current = crypto.randomUUID(); }} onSubmit={(event) => { event.preventDefault(); create(event.currentTarget); }}>
        <Field label="Тип"><select className={`${inputClass} w-full`} name="itemType" onChange={(event) => setCreateType(event.target.value as ExternalNomenclatureItemType)} value={createType}><option value="equipment">Оборудование</option><option value="material">Материал</option><option value="service">Работа / услуга</option></select></Field>
        {createType !== "service" && <Field label="Производитель / бренд"><input className={`${inputClass} w-full`} maxLength={120} name="manufacturer" required /></Field>}
        {createType !== "service" && <Field label="Модель / код"><input className={`${inputClass} w-full`} maxLength={160} name="model" required /></Field>}
        <Field label="Наименование"><input className={`${inputClass} w-full`} maxLength={300} name="name" required /></Field>
        <Field label="Категория"><input className={`${inputClass} w-full`} maxLength={160} name="category" /></Field>
        <Field label="Единица измерения"><select className={`${inputClass} w-full`} defaultValue={createType === "service" ? "service" : "pcs"} key={createType} name="unit">{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></Field>
        <Field className="sm:col-span-2 xl:col-span-3" label="Описание"><textarea className={`${inputClass} min-h-20 w-full py-2`} maxLength={2000} name="specification" /></Field>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2 xl:col-span-3">
          {duplicateWarning && <button className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold" disabled={pending} onClick={(event) => create(event.currentTarget.form!, true)} type="button">Всё равно создать новую</button>}
          <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={pending} type="submit"><Plus className="size-4" />Создать</button>
        </div>
      </form>
    </details>

    {message && <p aria-live="polite" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm">{message}</p>}

    {records.length ? <>
      <div className="hidden overflow-x-auto border-y border-zinc-200 bg-white lg:block">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Наименование</th><th className="px-4 py-3">Тип</th><th className="px-4 py-3">Производитель / бренд</th><th className="px-4 py-3">Модель / код</th><th className="px-4 py-3">Ед. изм.</th><th className="px-4 py-3">Последнее использование</th><th className="px-4 py-3">Действия</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">{records.map((item) => <NomenclatureRow item={item} key={item.id} pending={pending} run={run} />)}</tbody>
        </table>
      </div>
      <div className="space-y-3 lg:hidden">{records.map((item) => <NomenclatureCard item={item} key={item.id} pending={pending} run={run} />)}</div>
    </> : <section className="border-y border-dashed border-zinc-300 py-14 text-center"><h2 className="font-semibold">В вашей номенклатуре пока нет позиций</h2><p className="mt-1 text-sm text-zinc-500">Создайте оборудование, материал или работу для повторного использования в сметах.</p></section>}
  </div>;
}

function NomenclatureRow({ item, pending, run }: ItemProps) {
  return <tr className="align-top"><td className="px-4 py-4"><strong>{item.name}</strong>{item.category && <span className="mt-1 block text-xs text-zinc-500">{item.category}</span>}</td><td className="px-4 py-4">{externalNomenclatureItemTypeLabel(item.itemType)}</td><td className="px-4 py-4">{item.manufacturer ?? "—"}</td><td className="px-4 py-4">{item.model ?? "—"}</td><td className="px-4 py-4">{unitLabel(item.unit)}</td><td className="px-4 py-4">{formatDate(item.lastUsedAt)}</td><td className="px-4 py-3"><ItemActions item={item} pending={pending} run={run} /></td></tr>;
}

function NomenclatureCard({ item, pending, run }: ItemProps) {
  return <article className="border-y border-zinc-200 bg-white py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block break-words">{item.name}</strong><span className="mt-1 block text-xs text-zinc-500">{externalNomenclatureItemTypeLabel(item.itemType)} · {unitLabel(item.unit)}</span></div><ItemActions item={item} pending={pending} run={run} /></div><dl className="mt-3 grid grid-cols-[8rem_minmax(0,1fr)] gap-2 text-sm"><dt className="text-zinc-500">Производитель</dt><dd className="break-words">{item.manufacturer ?? "—"}</dd><dt className="text-zinc-500">Модель / код</dt><dd className="break-words">{item.model ?? "—"}</dd><dt className="text-zinc-500">Использование</dt><dd>{formatDate(item.lastUsedAt)}</dd></dl></article>;
}

type ItemProps = {
  item: PartnerNomenclatureDto;
  pending: boolean;
  run: (operation: () => Promise<{ success: boolean; message: string }>) => void;
};

function ItemActions({ item, pending, run }: ItemProps) {
  return <details className="relative"><summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold">Изменить</summary><form className="absolute right-0 z-20 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-lg" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => updatePartnerNomenclatureAction(item.id, item.version, {
      name: String(form.get("name") ?? ""),
      category: String(form.get("category") ?? ""),
      unit: String(form.get("unit") ?? item.unit) as EstimateUnit,
      specification: String(form.get("specification") ?? ""),
    }));
  }}>
    <p className="text-xs text-zinc-500">Производитель и модель являются общей идентичностью и здесь не меняются.</p>
    <Field label="Наименование"><input className={`${inputClass} w-full`} defaultValue={item.name} maxLength={300} name="name" required /></Field>
    <Field label="Категория"><input className={`${inputClass} w-full`} defaultValue={item.category ?? ""} maxLength={160} name="category" /></Field>
    <Field label="Единица измерения"><select className={`${inputClass} w-full`} defaultValue={item.unit} name="unit">{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></Field>
    <Field label="Описание"><textarea className={`${inputClass} min-h-20 w-full py-2`} defaultValue={item.specification ?? ""} maxLength={2000} name="specification" /></Field>
    <div className="flex flex-wrap justify-between gap-2"><button className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-red-700" disabled={pending} onClick={() => run(() => archivePartnerNomenclatureAction(item.id, item.version))} type="button"><Archive className="size-4" />Убрать из библиотеки</button><button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white" disabled={pending} type="submit"><Save className="size-4" />Сохранить</button></div>
  </form></details>;
}

function Field({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  return <label className={`min-w-0 text-xs font-medium text-zinc-600 ${className}`}>{label}<span className="mt-1 block">{children}</span></label>;
}

function nomenclatureInput(data: FormData, itemType: ExternalNomenclatureItemType, requestKey: string, forceCreateNew: boolean): PartnerNomenclatureInput {
  return {
    itemType,
    manufacturer: itemType === "service" ? null : String(data.get("manufacturer") ?? ""),
    model: itemType === "service" ? null : String(data.get("model") ?? ""),
    name: String(data.get("name") ?? ""),
    category: String(data.get("category") ?? ""),
    unit: String(data.get("unit") ?? (itemType === "service" ? "service" : "pcs")) as EstimateUnit,
    specification: String(data.get("specification") ?? ""),
    forceCreateNew,
    requestKey,
  };
}

function unitLabel(unit: EstimateUnit) { return units.find((candidate) => candidate.value === unit)?.label ?? unit; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : "Не использовалась"; }
