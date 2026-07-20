"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createPurchasingListAction } from "../actions";

export function PurchasingListCreateForm() {
  const router = useRouter(); const [pending, startTransition] = useTransition(); const [error, setError] = useState("");
  return <form className="max-w-2xl space-y-5" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(async () => { const result = await createPurchasingListAction({ name: String(form.get("name")), description: String(form.get("description")), visibility: String(form.get("visibility")) as "private" | "company" }); if (result.success) router.push(`/cabinet/purchasing-lists/${result.data.id}`); else setError("Не удалось создать список. Проверьте данные и доступ."); }); }}>
    <label className="block"><span className="text-sm font-medium">Название</span><input autoFocus className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" maxLength={120} name="name" required /></label>
    <label className="block"><span className="text-sm font-medium">Описание</span><textarea className="mt-1 min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2" maxLength={1000} name="description" /></label>
    <fieldset><legend className="text-sm font-medium">Доступ</legend><div className="mt-2 grid gap-2 sm:grid-cols-2"><Visibility value="private" title="Личный" description="Виден только вам." defaultChecked /><Visibility value="company" title="Для компании" description="Виден коллегам с доступом." /></div></fieldset>
    {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}
    <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending} type="submit">{pending ? "Создание..." : "Создать список"}</button>
  </form>;
}
function Visibility({ value, title, description, defaultChecked = false }: { value: string; title: string; description: string; defaultChecked?: boolean }) { return <label className="flex cursor-pointer gap-3 rounded-md border border-zinc-200 p-3"><input className="mt-1 accent-emerald-700" defaultChecked={defaultChecked} name="visibility" type="radio" value={value} /><span><strong className="block text-sm">{title}</strong><span className="text-xs text-zinc-500">{description}</span></span></label>; }
