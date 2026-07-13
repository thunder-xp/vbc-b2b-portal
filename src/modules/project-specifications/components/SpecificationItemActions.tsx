"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addProjectSpecificationItemAction, removeProjectSpecificationItemAction, submitProjectSpecificationAction, updateProjectSpecificationItemQuantityAction } from "../actions";

export function AddSpecificationItemButton({ specificationId, productId }: { specificationId: string; productId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return <div className="flex items-center gap-2"><button className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50" disabled={isPending} onClick={() => startTransition(async () => { const result = await addProjectSpecificationItemAction(specificationId, productId, 1); setMessage(result.success ? "Добавлено" : result.message); if (result.success) router.refresh(); })} type="button">{isPending ? "..." : "Добавить"}</button>{message && <span className="text-xs text-zinc-500" role="status">{message}</span>}</div>;
}

export function SpecificationItemControls({ specificationId, itemId, quantity }: { specificationId: string; itemId: string; quantity: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return <div className="flex min-w-32 items-center gap-2"><input aria-label="Количество" className="h-9 w-20 rounded-md border border-zinc-300 px-2" defaultValue={quantity} disabled={isPending} min={1} max={9999} onBlur={(event) => { const nextQuantity = Number(event.currentTarget.value); if (nextQuantity === quantity) return; startTransition(async () => { const result = await updateProjectSpecificationItemQuantityAction(specificationId, itemId, nextQuantity); setMessage(result.message); router.refresh(); }); }} type="number" /><button aria-label="Удалить позицию" className="grid size-9 place-items-center rounded-md border border-zinc-300 text-zinc-500 hover:border-red-300 hover:text-red-700" disabled={isPending} onClick={() => startTransition(async () => { const result = await removeProjectSpecificationItemAction(specificationId, itemId); setMessage(result.message); if (result.success) router.refresh(); })} title="Удалить позицию" type="button"><Trash2 className="size-4" /></button>{message && <span className="sr-only" role="status">{message}</span>}</div>;
}

export function SubmitSpecificationButton({ specificationId, disabled }: { specificationId: string; disabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return <div className="flex items-center gap-3"><button className="rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled || isPending} onClick={() => startTransition(async () => { const result = await submitProjectSpecificationAction(specificationId); setMessage(result.message); if (result.success) router.refresh(); })} type="button">{isPending ? "Отправка..." : "Отправить в Novotech"}</button>{message && <p className="text-sm text-zinc-600" role="status">{message}</p>}</div>;
}
