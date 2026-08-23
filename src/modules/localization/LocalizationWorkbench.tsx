"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  requestLocalizationRetranslationAction,
  revertLocalizationToMachineDraftAction,
  saveLocalizationAction,
} from "./actions";
import type { LocalizationEntityType, LocalizationWorkbenchItem } from "./types";

export function LocalizationWorkbench({ canManage, entityType, items }: {
  canManage: boolean; entityType: LocalizationEntityType; items: LocalizationWorkbenchItem[];
}) {
  return <div className="divide-y divide-zinc-200 border border-zinc-200 bg-white">{items.map((item) =>
    <LocalizationEditor canManage={canManage} entityType={entityType} item={item} key={item.id} />
  )}</div>;
}

function LocalizationEditor({ canManage, entityType, item }: {
  canManage: boolean; entityType: LocalizationEntityType; item: LocalizationWorkbenchItem;
}) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [localizedName, setLocalizedName] = useState(item.localizedName ?? "");
  const [localizedDescription, setLocalizedDescription] = useState(item.localizedDescription ?? "");
  const [seoTitle, setSeoTitle] = useState(item.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(item.seoDescription ?? "");
  const content = {
    localizedName, ...(entityType === "category" ? { intro: localizedDescription } : { description: localizedDescription }),
    seoTitle, seoDescription,
  };
  const save = (action: "save_draft" | "review") => startTransition(async () => {
    const result = await saveLocalizationAction({ entityType, entityId: item.id, action,
      sourceHash: item.currentHash, expectedRevision: item.revision ?? 0, content });
    setMessage(result.message);
    if (result.success) router.refresh();
  });
  const retranslate = () => startTransition(async () => {
    const result = await requestLocalizationRetranslationAction({ entityType, entityId: item.id });
    setMessage(result.message);
    if (result.success) router.refresh();
  });
  const revertToMachineDraft = () => startTransition(async () => {
    const result = await revertLocalizationToMachineDraftAction({ entityType, entityId: item.id,
      sourceHash: item.currentHash, expectedRevision: item.revision ?? 0 });
    setMessage(result.message);
    if (result.success && item.machineDraftContent) {
      setLocalizedName(item.machineDraftContent.localizedName ?? "");
      setLocalizedDescription(entityType === "category"
        ? item.machineDraftContent.intro ?? ""
        : item.machineDraftContent.description ?? item.machineDraftContent.shortDescription ?? "");
      setSeoTitle(item.machineDraftContent.seoTitle ?? "");
      setSeoDescription(item.machineDraftContent.seoDescription ?? "");
      router.refresh();
    }
  });
  return <details className="group" open={item.effectiveStatus === "outdated"}>
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 focus-visible:outline-2 focus-visible:outline-blue-600">
      <span className="min-w-0"><span className="block truncate font-semibold">{item.sourceName}</span>{item.sku ? <span className="text-xs text-zinc-500">SKU {item.sku}</span> : null}</span>
      <StatusBadge status={item.effectiveStatus} />
    </summary>
    <div className="grid gap-5 border-t border-zinc-100 bg-zinc-50 p-4 lg:grid-cols-2">
      <section aria-label="Исходный текст"><h3 className="text-xs font-semibold uppercase text-zinc-500">Источник · RU</h3><p className="mt-2 font-semibold">{item.sourceName}</p><p className="mt-3 max-h-52 overflow-auto whitespace-pre-line text-sm leading-6 text-zinc-600">{item.sourceDescription || "Описание отсутствует"}</p><p className="mt-3 break-all text-[11px] text-zinc-400">Хэш {item.currentHash}</p></section>
      <section aria-label="Румынская локализация" className="space-y-3"><h3 className="text-xs font-semibold uppercase text-blue-700">Локализация · RO</h3>
        {item.effectiveStatus === "outdated" ? <p className="border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">Источник изменился. Этот перевод не попадёт в новую публикацию до обновления.</p> : null}
        <p className="text-xs text-zinc-500">Последний перевод: {formatDate(item.translatedAt)} · Проверка: {formatDate(item.reviewedAt)}</p>
        <Field label="Название"><input className="min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm" disabled={!canManage || pending} value={localizedName} onChange={(event)=>setLocalizedName(event.target.value)} /></Field>
        <Field label={entityType === "category" ? "Введение" : "Описание"}><textarea className="min-h-28 w-full resize-y border border-zinc-300 bg-white px-3 py-2 text-sm" disabled={!canManage || pending} value={localizedDescription} onChange={(event)=>setLocalizedDescription(event.target.value)} /></Field>
        <Field label="SEO title"><input className="min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm" disabled={!canManage || pending} value={seoTitle} onChange={(event)=>setSeoTitle(event.target.value)} /></Field>
        <Field label="SEO description"><textarea className="min-h-20 w-full resize-y border border-zinc-300 bg-white px-3 py-2 text-sm" disabled={!canManage || pending} value={seoDescription} onChange={(event)=>setSeoDescription(event.target.value)} /></Field>
        {canManage ? <div className="flex flex-wrap gap-2"><button className="min-h-11 border border-zinc-300 bg-white px-4 text-sm font-semibold disabled:opacity-50" disabled={pending} onClick={()=>save("save_draft")} type="button">Сохранить черновик</button><button className="min-h-11 bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} onClick={()=>save("review")} type="button">Проверено</button>{item.machineDraftContent ? <button className="min-h-11 border border-zinc-300 bg-white px-4 text-sm font-semibold disabled:opacity-50" disabled={pending} onClick={revertToMachineDraft} type="button">Вернуть машинный черновик</button> : null}<button className="min-h-11 px-3 text-sm font-semibold text-blue-800 disabled:opacity-50" disabled={pending} onClick={retranslate} type="button">Перевести заново</button></div> : null}
        <p aria-live="polite" className="min-h-5 text-xs text-zinc-600">{message}</p>
      </section>
    </div>
  </details>;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="block text-xs font-semibold text-zinc-600"><span className="mb-1 block">{label}</span>{children}</label>; }
function StatusBadge({ status }: { status: LocalizationWorkbenchItem["effectiveStatus"] }) {
  const copy = { missing: "Нет перевода", machine_draft: "Машинный черновик", reviewed: "Проверено", outdated: "Устарело" }[status];
  const tone = status === "reviewed" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : status === "outdated" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-zinc-300 bg-white text-zinc-700";
  return <span className={`shrink-0 border px-2 py-1 text-xs font-semibold ${tone}`}>{copy}</span>;
}
