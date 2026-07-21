"use client";

import { Archive, Copy, RotateCcw, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addPurchasingListToCartAction, createEstimateFromPurchasingListAction, duplicatePurchasingListAction, setPurchasingListArchivedAction } from "../actions";

export function PurchasingListActions({ listId, name, revision, archived, canManage, isSystemFavorites = false }: { listId: string; name: string; revision: number; archived: boolean; canManage: boolean; isSystemFavorites?: boolean }) {
  const router = useRouter(); const [pending, startTransition] = useTransition(); const [message, setMessage] = useState("");
  const [cartRequestKey, setCartRequestKey] = useState(() => crypto.randomUUID()); const [estimateRequestKey, setEstimateRequestKey] = useState(() => crypto.randomUUID());
  const run = (operation: () => Promise<{ success: boolean; message: string; data: unknown }>, destination?: (data: unknown) => string, onSuccess?: () => void) => startTransition(async () => { const result = await operation(); setMessage(result.success ? result.message : "Операция не выполнена."); if (result.success) onSuccess?.(); if (result.success && destination) router.push(destination(result.data)); else router.refresh(); });
  return <div className="flex flex-wrap gap-2">
    {!archived ? <button aria-label="Добавить список в корзину" className="icon-action" disabled={pending} onClick={() => run(() => addPurchasingListToCartAction({ listId, requestKey: cartRequestKey }), undefined, () => setCartRequestKey(crypto.randomUUID()))} title="Добавить в корзину" type="button"><ShoppingCart className="size-4" /></button> : null}
    {!archived ? <button className="text-action" disabled={pending} onClick={() => run(() => createEstimateFromPurchasingListAction({ listId, name: `Смета — ${name}`, requestKey: estimateRequestKey }), (data) => `/cabinet/estimates/${(data as { estimateId: string }).estimateId}`, () => setEstimateRequestKey(crypto.randomUUID()))} type="button">Создать смету</button> : null}
    {canManage ? <button aria-label="Дублировать список" className="icon-action" disabled={pending} onClick={() => run(() => duplicatePurchasingListAction(listId), (data) => `/cabinet/purchasing-lists/${(data as { id: string }).id}`)} title="Дублировать" type="button"><Copy className="size-4" /></button> : null}
    {canManage && !isSystemFavorites ? <button aria-label={archived ? "Восстановить список" : "Архивировать список"} className="icon-action" disabled={pending} onClick={() => run(() => setPurchasingListArchivedAction(listId, revision, !archived))} title={archived ? "Восстановить" : "Архивировать"} type="button">{archived ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}</button> : null}
    {message ? <span className="w-full text-xs text-zinc-600" role="status">{message}</span> : null}
  </div>;
}
