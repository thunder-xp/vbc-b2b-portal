"use client";

import { ClipboardList, X } from "lucide-react";
import { useState, useTransition } from "react";

import { addProjectSpecificationItemAction, listProjectSpecificationsAction } from "../../project-specifications/actions";

export function ProductSpecificationAction({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Array<{ id: string; projectName: string }>>([]);
  const [specificationId, setSpecificationId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!drafts.length) startTransition(async () => {
      const result = await listProjectSpecificationsAction();
      if (!result.success) { setMessage("Не удалось загрузить черновики спецификаций."); return; }
      const nextDrafts = result.data.filter((item) => item.status === "draft").map(({ id, projectName }) => ({ id, projectName }));
      setDrafts(nextDrafts);
      setSpecificationId(nextDrafts[0]?.id ?? "");
    });
  };

  return <div className="relative">
    <button aria-expanded={open} className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50" onClick={toggle} type="button"><ClipboardList aria-hidden="true" className="size-4" />В смету</button>
    {open ? <div className="absolute left-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-zinc-200 bg-white p-4 shadow-lg">
      <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-zinc-950">Добавить в спецификацию</p><button aria-label="Закрыть" className="rounded p-1 text-zinc-500 hover:bg-zinc-100" onClick={() => setOpen(false)} type="button"><X aria-hidden="true" className="size-4" /></button></div>
      {drafts.length ? <div className="mt-3 space-y-3"><label className="block text-xs font-medium text-zinc-700">Черновик<select className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" onChange={(event) => setSpecificationId(event.target.value)} value={specificationId}>{drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.projectName}</option>)}</select></label><label className="block text-xs font-medium text-zinc-700">Количество<input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" max={9999} min={1} onChange={(event) => setQuantity(Number(event.target.value))} type="number" value={quantity} /></label><button className="w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || !specificationId || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999} onClick={() => startTransition(async () => { const result = await addProjectSpecificationItemAction(specificationId, productId, quantity); setMessage(result.success ? "Товар добавлен в спецификацию." : "Не удалось добавить товар."); if (result.success) setOpen(false); })} type="button">Добавить</button></div> : !pending ? <p className="mt-3 text-sm text-zinc-600">Нет доступных черновиков. Создайте спецификацию в разделе «Спецификации».</p> : <p className="mt-3 text-sm text-zinc-600">Загрузка…</p>}
      {message ? <p aria-live="polite" className="mt-2 text-xs text-zinc-600">{message}</p> : null}
    </div> : null}
  </div>;
}
