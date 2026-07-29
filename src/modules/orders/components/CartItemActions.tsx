"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "../../access-control/actions/action-result";
import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import { removeCartItemAction, updateCartItemAction } from "../actions/cart.actions";

const initial: ActionResult<null> = { success: true, errorCode: null, message: "", data: null };

export function CartItemActions({ itemId, quantity }: { itemId: string; quantity: number }) {
  const [draft, setDraft] = useState(quantity);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const update = (next: number) => {
    if (!Number.isInteger(next) || next < 1 || next > 9999) {
      setMessage("Укажите количество от 1 до 9999.");
      return;
    }
    setDraft(next);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("itemId", itemId);
      formData.set("quantity", String(next));
      const result = await updateCartItemAction(initial, formData);
      setMessage(result.message || (result.success ? "Количество обновлено." : "Не удалось обновить количество. Повторите попытку."));
      if (result.success) {
        recordBehaviorInteraction({ eventName: "cart_quantity_changed", quantity: next, route: "/cabinet/cart", sourceSurface: "cart" });
        router.refresh();
      }
      else setDraft(quantity);
    });
  };

  const remove = () => startTransition(async () => {
    const formData = new FormData();
    formData.set("itemId", itemId);
    const result = await removeCartItemAction(initial, formData);
    setMessage(result.message || (result.success ? "Товар удалён." : "Не удалось удалить товар. Повторите попытку."));
    if (result.success) {
      recordBehaviorInteraction({ eventName: "product_removed_from_cart", route: "/cabinet/cart", sourceSurface: "cart" });
      router.refresh();
    }
  });

  return <div className="space-y-2">
    <div className="flex items-end gap-1.5">
      <button aria-label="Уменьшить количество" className="inline-flex size-11 items-center justify-center rounded-md border border-zinc-300" disabled={pending || draft <= 1} onClick={() => update(draft - 1)} type="button"><Minus aria-hidden="true" className="size-4" /></button>
      <label className="text-xs text-zinc-600">Количество<input aria-label="Количество товара" className="mt-1 block h-11 w-20 rounded-md border border-zinc-300 px-2 text-center text-sm" disabled={pending} max={9999} min={1} onBlur={() => update(draft)} onChange={(event) => setDraft(event.target.valueAsNumber)} type="number" value={draft} /></label>
      <button aria-label="Увеличить количество" className="inline-flex size-11 items-center justify-center rounded-md border border-zinc-300" disabled={pending || draft >= 9999} onClick={() => update(draft + 1)} type="button"><Plus aria-hidden="true" className="size-4" /></button>
    </div>
    <button className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-rose-700" disabled={pending} onClick={remove} type="button"><Trash2 aria-hidden="true" className="size-4" />Удалить</button>
    {message && <p aria-live="polite" className="text-xs text-zinc-500">{message}</p>}
  </div>;
}
