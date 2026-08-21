"use client";

import { Archive, Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { archivePartnerNomenclatureAction, createPartnerNomenclatureAction, updatePartnerNomenclatureAction, updatePartnerNomenclatureCoverAction } from "../actions";
import type { ExternalNomenclatureItemType } from "../repositories";
import type { PartnerNomenclatureDto, PartnerNomenclatureInput } from "../services";
import { nomenclatureCoverFileError } from "../services/nomenclature-cover.policy";
import type { EstimateUnit } from "../types";
import { DirectoryEditorDialog } from "./DirectoryEditorDialog";
import { NomenclatureCover } from "./NomenclatureCover";
import { formatPartnerDate, getEstimatesCopy, usePartnerLocale, type EstimatesCopy, type PartnerLocale } from "../../partner-locale";

const inputClass = "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:bg-zinc-100";
const units: EstimateUnit[] = ["pcs", "meter", "set", "hour", "visit", "service"];

export function PartnerNomenclatureWorkspace({ records }: { records: PartnerNomenclatureDto[] }) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const router = useRouter();
  const [editor, setEditor] = useState<PartnerNomenclatureDto | "new" | null>(null);
  const [createType, setCreateType] = useState<ExternalNomenclatureItemType>("equipment");
  const [message, setMessage] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [pending, startTransition] = useTransition();
  const createRequestKey = useRef(crypto.randomUUID());

  const complete = (operation: () => Promise<{ success: boolean; message: string }>, close = true) => startTransition(async () => {
    const result = await operation();
    setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);
    if (result.success) {
      if (close) setEditor(null);
      router.refresh();
    }
  });

  const create = (form: HTMLFormElement, forceCreateNew = false) => {
    const input = nomenclatureInput(new FormData(form), createType, createRequestKey.current, forceCreateNew);
    startTransition(async () => {
      const result = await createPartnerNomenclatureAction(input);
      setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);
      setDuplicateWarning(!result.success && result.message.includes("Похожая позиция"));
      if (result.success) {
        createRequestKey.current = crypto.randomUUID();
        setEditor(null);
        router.refresh();
      }
    });
  };

  return <div className="space-y-5">
    <div className="flex justify-end"><button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" onClick={() => { setCreateType("equipment"); setDuplicateWarning(false); setEditor("new"); }} type="button"><Plus className="size-4" />{copy.addPosition}</button></div>
    {message && <p aria-live="polite" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm">{message}</p>}
    {records.length ? <>
      <div className="hidden overflow-x-auto border-y border-zinc-200 bg-white lg:block">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">{copy.itemName}</th><th className="px-4 py-3">{copy.itemType}</th><th className="px-4 py-3">{copy.manufacturerBrand}</th><th className="px-4 py-3">{copy.modelCode}</th><th className="px-4 py-3">{copy.unitOfMeasure}</th><th className="px-4 py-3">{copy.lastUsed}</th><th className="px-4 py-3">{copy.actions}</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">{records.map((item) => <NomenclatureRow copy={copy} item={item} key={item.id} locale={locale} onEdit={setEditor} />)}</tbody>
        </table>
      </div>
      <div className="space-y-3 lg:hidden">{records.map((item) => <NomenclatureCard copy={copy} item={item} key={item.id} locale={locale} onEdit={setEditor} />)}</div>
    </> : <section className="border-y border-dashed border-zinc-300 py-14 text-center"><h2 className="font-semibold">{copy.nomenclatureEmpty}</h2><p className="mt-1 text-sm text-zinc-500">{copy.nomenclatureEmptyHint}</p></section>}
    {editor ? <NomenclatureEditor
      createType={createType} duplicateWarning={duplicateWarning} item={editor === "new" ? null : editor}
      copy={copy} locale={locale}
      onClose={() => setEditor(null)} onCreate={(form, force) => create(form, force)} onCreateType={setCreateType}
      onUpdate={(item, form) => complete(() => updatePartnerNomenclatureAction(item.id, item.version, form))}
      onArchive={(item) => complete(() => archivePartnerNomenclatureAction(item.id, item.version))} onMessage={setMessage} pending={pending}
    /> : null}
  </div>;
}

function NomenclatureRow({ copy, item, locale, onEdit }: ItemProps) {
  return <tr className="align-top"><td className="px-4 py-4"><div className="flex gap-3"><NomenclatureCover hasCover={item.hasCover} itemId={item.id} name={item.name} /><span><strong>{item.name}</strong>{item.category && <span className="mt-1 block text-xs text-zinc-500">{item.category}</span>}</span></div></td><td className="px-4 py-4">{itemTypeLabel(item.itemType, copy)}</td><td className="px-4 py-4">{item.manufacturer ?? "—"}</td><td className="px-4 py-4">{item.model ?? "—"}</td><td className="px-4 py-4">{unitLabel(item.unit, locale)}</td><td className="px-4 py-4">{formatLastUsed(item.lastUsedAt, locale, copy)}</td><td className="px-4 py-3"><EditButton copy={copy} item={item} onEdit={onEdit} /></td></tr>;
}

function NomenclatureCard({ copy, item, locale, onEdit }: ItemProps) {
  return <article className="border-y border-zinc-200 bg-white py-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><NomenclatureCover hasCover={item.hasCover} itemId={item.id} name={item.name} /><div className="min-w-0"><strong className="block break-words">{item.name}</strong><span className="mt-1 block text-xs text-zinc-500">{itemTypeLabel(item.itemType, copy)} · {unitLabel(item.unit, locale)}</span></div></div><EditButton copy={copy} item={item} onEdit={onEdit} /></div><dl className="mt-3 grid grid-cols-[8rem_minmax(0,1fr)] gap-2 text-sm"><dt className="text-zinc-500">{copy.manufacturer}</dt><dd className="break-words">{item.manufacturer ?? "—"}</dd><dt className="text-zinc-500">{copy.modelCode}</dt><dd className="break-words">{item.model ?? "—"}</dd><dt className="text-zinc-500">{copy.usage}</dt><dd>{formatLastUsed(item.lastUsedAt, locale, copy)}</dd></dl></article>;
}

type ItemProps = { copy: EstimatesCopy; item: PartnerNomenclatureDto; locale: PartnerLocale; onEdit: (item: PartnerNomenclatureDto) => void };
function EditButton({ copy, item, onEdit }: Omit<ItemProps, "locale">) { return <button className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold" onClick={() => onEdit(item)} type="button">{copy.edit}</button>; }

function NomenclatureEditor({ copy, item, createType, duplicateWarning, locale, onClose, onCreate, onCreateType, onUpdate, onArchive, onMessage, pending }: {
  copy: EstimatesCopy; locale: PartnerLocale;
  item: PartnerNomenclatureDto | null; createType: ExternalNomenclatureItemType; duplicateWarning: boolean; onClose: () => void;
  onCreate: (form: HTMLFormElement, force?: boolean) => void; onCreateType: (type: ExternalNomenclatureItemType) => void;
  onUpdate: (item: PartnerNomenclatureDto, input: { name: string; category: string; unit: EstimateUnit; specification: string }) => void;
  onArchive: (item: PartnerNomenclatureDto) => void; onMessage: (message: string) => void; pending: boolean;
}) {
  const effectiveType = item?.itemType ?? createType;
  return <DirectoryEditorDialog description={item ? copy.libraryEditHint : copy.libraryCreateHint} onClose={onClose} title={item ? copy.editPosition : copy.newPosition}>
    <form className="grid min-w-0 gap-4 p-5 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      if (!item) return onCreate(event.currentTarget);
      const form = new FormData(event.currentTarget);
      onUpdate(item, { name: String(form.get("name") ?? ""), category: String(form.get("category") ?? ""), unit: String(form.get("unit") ?? item.unit) as EstimateUnit, specification: String(form.get("specification") ?? "") });
    }}>
      <Field label={copy.itemType}><select className={`${inputClass} w-full`} disabled={Boolean(item)} name="itemType" onChange={(event) => onCreateType(event.target.value as ExternalNomenclatureItemType)} value={effectiveType}><option value="equipment">{copy.equipmentType}</option><option value="material">{copy.materialType}</option><option value="service">{copy.serviceType}</option></select></Field>
      {effectiveType !== "service" ? <><Field label={copy.manufacturerBrand}><input className={`${inputClass} w-full`} defaultValue={item?.manufacturer ?? ""} disabled={Boolean(item)} maxLength={120} name="manufacturer" required /></Field><Field label={copy.modelCode}><input className={`${inputClass} w-full`} defaultValue={item?.model ?? ""} disabled={Boolean(item)} maxLength={160} name="model" required /></Field></> : null}
      {item && effectiveType !== "service" ? <p className="self-end text-xs text-zinc-500">{copy.identityImmutable}</p> : null}
      <Field label={copy.itemName}><input className={`${inputClass} w-full`} defaultValue={item?.name ?? ""} maxLength={300} name="name" required /></Field>
      <Field label={copy.category}><input className={`${inputClass} w-full`} defaultValue={item?.category ?? ""} maxLength={160} name="category" /></Field>
      <Field label={copy.unitOfMeasure}><select className={`${inputClass} w-full`} defaultValue={item?.unit ?? (effectiveType === "service" ? "service" : "pcs")} key={item?.id ?? effectiveType} name="unit">{units.map((unit) => <option key={unit} value={unit}>{unitLabel(unit, locale)}</option>)}</select></Field>
      <Field className="sm:col-span-2" label={copy.specification}><textarea className={`${inputClass} min-h-24 w-full py-2`} defaultValue={item?.specification ?? ""} maxLength={2000} name="specification" /></Field>
      {effectiveType !== "service" ? <CoverEditor copy={copy} item={item} pending={pending} onComplete={onClose} onMessage={onMessage} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4 sm:col-span-2">
        {item ? <button className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-red-700" disabled={pending} onClick={() => onArchive(item)} type="button"><Archive className="size-4" />{copy.removeFromLibrary}</button> : <span />}
        <div className="flex flex-wrap justify-end gap-2">{!item && duplicateWarning ? <button className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold" disabled={pending} onClick={(event) => onCreate(event.currentTarget.form!, true)} type="button">{copy.forceCreate}</button> : null}<button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold" onClick={onClose} type="button">{copy.cancel}</button><button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={pending} type="submit"><Save className="size-4" />{item ? copy.save : copy.create}</button></div>
      </div>
    </form>
  </DirectoryEditorDialog>;
}

function CoverEditor({ copy, item, pending, onComplete, onMessage }: { copy: EstimatesCopy; item: PartnerNomenclatureDto | null; pending: boolean; onComplete: () => void; onMessage: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [coverPending, startTransition] = useTransition();
  if (!item) return <p className="text-xs text-zinc-500 sm:col-span-2">{copy.photoAfterCreate}</p>;
  if (item.coverScope === "canonical" || item.curationStatus === "active") return <div className="flex items-center gap-3 sm:col-span-2"><NomenclatureCover hasCover={item.hasCover} itemId={item.id} name={item.name} size="lg" /><p className="text-xs text-zinc-500">{copy.canonicalCoverReadOnly}</p></div>;
  const mutate = (intent: "upload" | "remove") => {
    const data = new FormData(); data.set("intent", intent);
    if (intent === "upload") {
      const file = inputRef.current?.files?.[0];
      const error = nomenclatureCoverFileError(file);
      if (error) { onMessage(copy.coverFileInvalid); return; }
      data.set("cover", file!);
    }
    startTransition(async () => { const result = await updatePartnerNomenclatureCoverAction(item.id, item.version, data); onMessage(result.success ? copy.operationSucceeded : copy.operationFailed); if (result.success) onComplete(); });
  };
  return <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><NomenclatureCover hasCover={item.hasCover} itemId={item.id} name={item.name} size="lg" /><div className="min-w-0 space-y-2"><input accept="image/jpeg,image/png,image/webp" className="block max-w-full text-sm" disabled={pending || coverPending} ref={inputRef} type="file" /><div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:opacity-50" disabled={pending || coverPending} onClick={() => mutate("upload")} type="button">{item.hasCover ? copy.replacePhoto : copy.uploadPhoto}</button>{item.hasCover ? <button className="min-h-11 text-sm font-semibold text-red-700 disabled:opacity-50" disabled={pending || coverPending} onClick={() => mutate("remove")} type="button">{copy.deletePhoto}</button> : null}</div><p className="text-xs text-zinc-500">{copy.coverRequirements}</p></div></div>;
}

function Field({ children, className = "", label }: { children: React.ReactNode; className?: string; label: string }) { return <label className={`min-w-0 text-xs font-medium text-zinc-600 ${className}`}>{label}<span className="mt-1 block">{children}</span></label>; }
function nomenclatureInput(data: FormData, itemType: ExternalNomenclatureItemType, requestKey: string, forceCreateNew: boolean): PartnerNomenclatureInput { return { itemType, manufacturer: itemType === "service" ? null : String(data.get("manufacturer") ?? ""), model: itemType === "service" ? null : String(data.get("model") ?? ""), name: String(data.get("name") ?? ""), category: String(data.get("category") ?? ""), unit: String(data.get("unit") ?? (itemType === "service" ? "service" : "pcs")) as EstimateUnit, specification: String(data.get("specification") ?? ""), forceCreateNew, requestKey }; }
function unitLabel(unit: EstimateUnit, locale: PartnerLocale) { return ({ pcs: ["шт.", "buc."], meter: ["метр", "metru"], set: ["комплект", "set"], hour: ["час", "oră"], visit: ["выезд", "deplasare"], service: ["услуга", "serviciu"] } as const)[unit][locale === "ro" ? 1 : 0]; }
function formatLastUsed(value: string | null, locale: PartnerLocale, copy: EstimatesCopy) { return value ? formatPartnerDate(value, locale) : copy.neverUsed; }
function itemTypeLabel(type: ExternalNomenclatureItemType, copy: EstimatesCopy) { return type === "equipment" ? copy.equipmentType : type === "material" ? copy.materialType : copy.serviceType; }
