"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "../../access-control/actions/action-result";
import { removeCartItemAction, updateCartItemAction } from "../actions";

const initial: ActionResult<null> = { success: true, errorCode: null, message: "", data: null };

export function CartItemActions({ itemId, quantity }: { itemId: string; quantity: number }) {
  const [updateState, updateAction, updating] = useActionState(updateCartItemAction, initial);
  const [removeState, removeAction, removing] = useActionState(removeCartItemAction, initial);
  const router = useRouter();
  useEffect(() => { if (updateState.success && updateState.message) router.refresh(); }, [router, updateState]);
  useEffect(() => { if (removeState.success && removeState.message) router.refresh(); }, [removeState, router]);
  const message = updateState.message || removeState.message;
  return <div className="space-y-2">
    <form action={updateAction} className="flex flex-wrap items-end gap-2">
      <input name="itemId" type="hidden" value={itemId} />
      <label className="text-xs text-zinc-600">Количество<input className="mt-1 block h-9 w-24 rounded-md border border-zinc-300 px-2 text-sm" defaultValue={quantity} max={9999} min={1} name="quantity" required type="number" /></label>
      <button className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-semibold" disabled={updating} type="submit">Обновить</button>
    </form>
    <form action={removeAction}><input name="itemId" type="hidden" value={itemId} /><button className="text-xs font-semibold text-rose-700" disabled={removing} type="submit">Удалить</button></form>
    {message && <p aria-live="polite" className="text-xs text-zinc-500">{message}</p>}
  </div>;
}
