"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removePublicRetailCartItemAction, updatePublicRetailCartQuantityAction } from "../actions/retail-cart.actions";
import type { PublicRetailLocale } from "../types";

type Props = {
  publicProductId: string;
  bundleId: string | null;
  quantity: number;
  revision: number;
  locale: PublicRetailLocale;
};

export function PublicRetailCartItemActions({ publicProductId, bundleId, quantity, revision, locale }: Props) {
  const [currentQuantity, setCurrentQuantity] = useState(String(quantity));
  const [currentRevision, setCurrentRevision] = useState(revision);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const ru = locale === "ru";

  const update = (nextQuantity: number) => {
    if (!Number.isInteger(nextQuantity) || nextQuantity < 1 || nextQuantity > 99 || pending) return;
    startTransition(async () => {
      const result = await updatePublicRetailCartQuantityAction({
        publicProductId, bundleId, quantity: nextQuantity, expectedRevision: currentRevision, locale,
      });
      setMessage(result.message);
      if (result.success && result.data) {
        setCurrentQuantity(String(nextQuantity));
        setCurrentRevision(result.data.revision);
        router.refresh();
      }
    });
  };

  const remove = () => startTransition(async () => {
    const result = await removePublicRetailCartItemAction({
      publicProductId, bundleId, expectedRevision: currentRevision, locale,
    });
    setMessage(result.message);
    if (result.success) router.refresh();
  });

  return <div className="space-y-2">
    <div className="flex items-center gap-1">
      <button aria-label={ru ? "Уменьшить количество" : "Micșorează cantitatea"} className="grid size-11 place-items-center border border-zinc-300 hover:border-emerald-700 disabled:opacity-50" disabled={pending || Number(currentQuantity) <= 1} onClick={() => update(Number(currentQuantity) - 1)} type="button"><Minus aria-hidden="true" className="size-4" /></button>
      <label className="sr-only" htmlFor={`retail-cart-quantity-${publicProductId}-${bundleId ?? "standalone"}`}>{ru ? "Количество" : "Cantitate"}</label>
      <input className="h-11 w-16 border border-zinc-300 text-center text-sm tabular-nums outline-none focus:border-emerald-700" disabled={pending} id={`retail-cart-quantity-${publicProductId}-${bundleId ?? "standalone"}`} inputMode="numeric" max={99} min={1} onBlur={(event) => { const value = Number(event.currentTarget.value); if (Number.isInteger(value) && value >= 1 && value <= 99) update(value); else setCurrentQuantity(String(quantity)); }} onChange={(event) => setCurrentQuantity(event.target.value)} type="number" value={currentQuantity} />
      <button aria-label={ru ? "Увеличить количество" : "Mărește cantitatea"} className="grid size-11 place-items-center border border-zinc-300 hover:border-emerald-700 disabled:opacity-50" disabled={pending || Number(currentQuantity) >= 99} onClick={() => update(Number(currentQuantity) + 1)} type="button"><Plus aria-hidden="true" className="size-4" /></button>
      <button aria-label={ru ? "Удалить товар" : "Elimină produsul"} className="ml-2 grid size-11 place-items-center text-zinc-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50" disabled={pending} onClick={remove} type="button"><Trash2 aria-hidden="true" className="size-4" /></button>
    </div>
    <p aria-live="polite" className="min-h-4 text-xs text-zinc-600">{message}</p>
  </div>;
}
