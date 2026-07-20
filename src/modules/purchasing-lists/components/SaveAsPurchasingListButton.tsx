"use client";

import { BookmarkPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createPurchasingListFromCartAction, createPurchasingListFromOrderAction } from "../actions";

export function SaveAsPurchasingListButton({ source, orderId, selections, label = "Сохранить как список закупок" }: { source: "cart" | "order" | "quick_reorder"; orderId?: string; selections?: Array<{ lineId: string; quantity: number }>; label?: string }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [pending, startTransition] = useTransition(); const [error, setError] = useState("");
  return <><button className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800" onClick={() => setOpen(true)} type="button"><BookmarkPlus className="size-4" />{label}</button>
    {open ? <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <form aria-label="Сохранить список закупок" className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const metadata = { name: String(form.get("name")), description: String(form.get("description")), visibility: String(form.get("visibility")) as "private" | "company" }; startTransition(async () => { const result = source === "cart" ? await createPurchasingListFromCartAction(metadata) : await createPurchasingListFromOrderAction({ ...metadata, orderId: orderId!, selections: source === "quick_reorder" ? selections : undefined }); if (result.success) router.push(`/cabinet/purchasing-lists/${result.data.id}`); else setError("Не удалось сохранить список. Данные источника не изменены."); }); }}>
        <div className="flex items-center justify-between"><h2 className="font-semibold">Новый список закупок</h2><button aria-label="Закрыть" onClick={() => setOpen(false)} type="button"><X className="size-5" /></button></div>
        <label className="mt-4 block text-sm">Название<input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" maxLength={120} name="name" required /></label>
        <label className="mt-3 block text-sm">Описание<textarea className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" maxLength={1000} name="description" /></label>
        <label className="mt-3 block text-sm">Доступ<select className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" name="visibility"><option value="private">Личный</option><option value="company">Для компании</option></select></label>
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <button className="mt-5 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending} type="submit">{pending ? "Сохранение..." : "Сохранить"}</button>
      </form>
    </div> : null}</>;
}
