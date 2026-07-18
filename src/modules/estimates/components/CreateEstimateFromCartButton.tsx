"use client";

import { Calculator } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createEstimateFromCartAction } from "../actions/lifecycle.actions";

export function CreateEstimateFromCartButton() {
  const router = useRouter(); const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [message, setMessage] = useState<string | null>(null); const [pending, startTransition] = useTransition();
  return <div><button className="inline-flex w-full items-center justify-center gap-2 border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold" onClick={() => setOpen(true)} type="button"><Calculator className="size-4" />Создать смету из корзины</button>{message && <p className="mt-2 text-xs text-red-700">{message}</p>}{open && <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog"><form className="w-full max-w-md bg-white p-5 shadow-xl" onSubmit={(event) => { event.preventDefault(); startTransition(async () => { const result = await createEstimateFromCartAction(name, crypto.randomUUID()); setMessage(result.message); if (result.success) router.push(`/cabinet/estimates/${result.data.estimateId}`); }); }}><h2 className="text-lg font-semibold">Новая смета из корзины</h2><p className="mt-1 text-sm text-zinc-500">Корзина останется без изменений. Цены будут зафиксированы по текущим данным.</p><label className="mt-4 block text-sm font-medium">Название<input autoFocus className="mt-1 h-10 w-full border border-zinc-300 px-3" maxLength={200} onChange={(event) => setName(event.target.value)} required value={name} /></label><div className="mt-5 flex justify-end gap-2"><button className="h-10 border border-zinc-300 px-4 text-sm font-semibold" onClick={() => setOpen(false)} type="button">Отмена</button><button className="h-10 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45" disabled={pending || !name.trim()} type="submit">{pending ? "Создание..." : "Создать смету"}</button></div></form></div>}</div>;
}
