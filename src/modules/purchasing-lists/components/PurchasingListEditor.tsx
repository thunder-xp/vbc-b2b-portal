"use client";

import { ArrowDown, ArrowUp, Calculator, Save, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { CatalogCardImage } from "../../catalog/components/CatalogCardImage";
import type { PurchasingListDetailDto } from "../types";
import { addPurchasingListToCartAction, createEstimateFromPurchasingListAction, removePurchasingListItemsAction, updatePurchasingListItemsAction, updatePurchasingListMetadataAction } from "../actions";

export function PurchasingListEditor({ initial }: { initial: PurchasingListDetailDto }) {
  const router = useRouter(); const [pending, startTransition] = useTransition(); const [message, setMessage] = useState("");
  const [lines, setLines] = useState(initial.lines); const [selected, setSelected] = useState(new Set<string>());
  const [cartRequestKey, setCartRequestKey] = useState(() => crypto.randomUUID()); const [estimateRequestKey, setEstimateRequestKey] = useState(() => crypto.randomUUID());
  const editable = initial.canManage && !initial.archivedAt;
  const selections = useMemo(() => [...selected].map((itemId) => ({ itemId })), [selected]);
  const mutate = (operation: () => Promise<{ success: boolean; message: string; data: unknown }>, redirect?: (data: unknown) => string, onSuccess?: () => void) => startTransition(async () => { const result = await operation(); setMessage(result.success ? result.message : "Не удалось выполнить операцию. Выбор сохранён."); if (result.success) onSuccess?.(); if (result.success && redirect) router.push(redirect(result.data)); else if (result.success) router.refresh(); });
  const move = (index: number, direction: -1 | 1) => setLines((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  return <div className="space-y-5">
    <form className="grid gap-3 border-b border-zinc-200 pb-5 md:grid-cols-[1fr_1fr_160px_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); mutate(() => updatePurchasingListMetadataAction(initial.id, initial.revision, { name: String(data.get("name")), description: String(data.get("description")), visibility: String(data.get("visibility")) as "private" | "company" })); }}>
      <label className="text-sm">Название<input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={initial.name} disabled={!editable} name="name" /></label>
      <label className="text-sm">Описание<input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={initial.description ?? ""} disabled={!editable} name="description" /></label>
      <label className="text-sm">Доступ<select className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={initial.visibility} disabled={!editable} name="visibility"><option value="private">Личный</option><option value="company">Для компании</option></select></label>
      {editable ? <button className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white" disabled={pending} type="submit"><Save className="size-4" />Сохранить</button> : null}
    </form>

    <div className="flex flex-wrap items-center gap-2">
      {!initial.archivedAt ? <button className="text-action" disabled={!selected.size || pending} onClick={() => mutate(() => addPurchasingListToCartAction({ listId: initial.id, requestKey: cartRequestKey, selections }), undefined, () => setCartRequestKey(crypto.randomUUID()))} type="button"><ShoppingCart className="size-4" />Выбранное в корзину</button> : null}
      {!initial.archivedAt ? <button className="text-action" disabled={!lines.some((line) => line.canConvert) || pending} onClick={() => mutate(() => addPurchasingListToCartAction({ listId: initial.id, requestKey: cartRequestKey }), undefined, () => setCartRequestKey(crypto.randomUUID()))} type="button"><ShoppingCart className="size-4" />Все доступное в корзину</button> : null}
      {!initial.archivedAt ? <button className="text-action" disabled={!selected.size || pending} onClick={() => mutate(() => createEstimateFromPurchasingListAction({ listId: initial.id, name: `Смета — ${initial.name}`, requestKey: estimateRequestKey, selections }), (data) => `/cabinet/estimates/${(data as { estimateId: string }).estimateId}`, () => setEstimateRequestKey(crypto.randomUUID()))} type="button"><Calculator className="size-4" />Создать смету</button> : null}
      {editable ? <button className="text-action text-rose-700" disabled={!selected.size || pending} onClick={() => mutate(() => removePurchasingListItemsAction(initial.id, initial.revision, [...selected]))} type="button"><Trash2 className="size-4" />Удалить выбранное</button> : null}
      {editable && lines.length ? <button className="ml-auto text-action" disabled={pending} onClick={() => mutate(() => updatePurchasingListItemsAction(initial.id, initial.revision, lines.map((line, index) => ({ itemId: line.id, quantity: line.quantity, position: index + 1, note: line.note }))))} type="button"><Save className="size-4" />Сохранить позиции</button> : null}
    </div>
    {message ? <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm" role="status">{message}</p> : null}
    {!lines.length ? <section className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center"><h2 className="font-semibold">В этом списке пока нет товаров</h2><Link className="mt-4 inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white" href="/cabinet/catalog">Добавить товары</Link></section> : <ul className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 bg-white">
      {lines.map((line, index) => <li className="grid gap-3 p-4 md:grid-cols-[28px_64px_minmax(220px,1fr)_120px_150px_130px_80px] md:items-center" key={line.id}>
        <input aria-label={`Выбрать ${line.productName}`} checked={selected.has(line.id)} className="size-4 accent-emerald-700" onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(line.id); else next.delete(line.id); return next; })} type="checkbox" />
        <div className="relative aspect-square overflow-hidden rounded border border-zinc-200 bg-zinc-50"><CatalogCardImage alt={line.productName} sizes="96px" src={line.imageUrl} /></div>
        <div className="min-w-0"><Link className="font-semibold text-zinc-950 hover:text-emerald-700" href={line.slug ? `/cabinet/catalog/${line.slug}` : "/cabinet/catalog"}>{line.productName}</Link><p className="text-xs text-zinc-500">{line.sku}</p><p className={`mt-1 text-xs font-semibold ${line.canConvert ? "text-emerald-700" : "text-amber-700"}`}>{line.stateLabel}</p><label className="mt-2 block text-xs text-zinc-500">Примечание<input className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm" disabled={!editable} maxLength={500} onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, note: event.target.value || null } : item))} value={line.note ?? ""} /></label></div>
        <label className="text-xs text-zinc-500">Количество<input className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-2 text-sm" disabled={!editable} max={9999} min={1} onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: Number(event.target.value) } : item))} type="number" value={line.quantity} /></label>
        <div className="text-sm"><span className="text-xs text-zinc-500">Текущая цена</span><p className="font-semibold">{line.currentPartnerPrice ?? "Недоступна"}</p></div>
        <div className="text-sm"><span className="text-xs text-zinc-500">Наличие</span><p>{line.availableStock ?? "Уточняется"}</p>{line.expectedArrivalDate ? <p className="text-xs text-zinc-500">Поступление: {new Date(line.expectedArrivalDate).toLocaleDateString("ru-RU")}</p> : null}</div>
        {editable ? <div className="flex"><button aria-label="Переместить вверх" disabled={index === 0} onClick={() => move(index, -1)} type="button"><ArrowUp className="size-4" /></button><button aria-label="Переместить вниз" disabled={index === lines.length - 1} onClick={() => move(index, 1)} type="button"><ArrowDown className="size-4" /></button></div> : null}
      </li>)}
    </ul>}
  </div>;
}
