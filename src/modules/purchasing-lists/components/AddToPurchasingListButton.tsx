"use client";

import { ListPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { addCatalogProductToPurchasingListAction, createPurchasingListAction, listManageablePurchasingListsAction } from "../actions";

type Choice = { id: string; name: string; revision: number };
export function AddToPurchasingListButton({ compact = false, productId }: { compact?: boolean; productId: string }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [choices, setChoices] = useState<Choice[]>([]); const [pending, startTransition] = useTransition(); const [message, setMessage] = useState("");
  useEffect(() => { if (!open) return; void listManageablePurchasingListsAction().then((result) => { if (result.success) setChoices(result.data); }); }, [open]);
  return <><button aria-label={compact ? "Добавить в список" : undefined} className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white text-sm font-semibold text-zinc-800 ${compact ? "size-9 p-0" : "px-3"}`} onClick={() => setOpen(true)} title={compact ? "Добавить в список" : undefined} type="button"><ListPlus className="size-4" />{compact ? null : "Добавить в список"}</button>
    {open ? <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/45 p-4" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }} role="dialog">
      <form className="w-full max-w-md rounded-lg bg-white p-5" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(async () => { let listId = String(data.get("listId")); if (listId === "new") { const created = await createPurchasingListAction({ name: String(data.get("newName")), description: null, visibility: "private" }); if (!created.success) { setMessage("Не удалось создать список."); return; } listId = created.data.id; } const result = await addCatalogProductToPurchasingListAction({ listId, productId, quantity: Number(data.get("quantity")), mergeMode: String(data.get("mergeMode")) as "increase" | "replace" | "keep" }); if (result.success) { setMessage("Товар добавлен."); router.refresh(); } else setMessage("Не удалось добавить товар."); }); }}>
        <div className="flex justify-between"><h2 className="font-semibold">Добавить в список</h2><button aria-label="Закрыть" onClick={() => setOpen(false)} type="button"><X className="size-5" /></button></div>
        <label className="mt-4 block text-sm">Список<select className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" name="listId" required>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}<option value="new">Создать новый</option></select></label>
        <label className="mt-3 block text-sm">Название нового списка<input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" maxLength={120} name="newName" placeholder="Используется при создании" /></label>
        <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-sm">Количество<input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={1} max={9999} min={1} name="quantity" type="number" /></label><label className="text-sm">Если товар уже есть<select className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" name="mergeMode"><option value="increase">Увеличить</option><option value="replace">Заменить</option><option value="keep">Не менять</option></select></label></div>
        {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}<button className="mt-5 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending || (!choices.length && pending)} type="submit">{pending ? "Добавление..." : "Добавить"}</button>
      </form>
    </div> : null}</>;
}
