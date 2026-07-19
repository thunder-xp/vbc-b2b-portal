"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { CalendarClock, X } from "lucide-react";

import type { ActionResult } from "../../access-control/actions/action-result";
import { cancelOrderDateChangeRequestAction, createOrderDateChangeRequestAction } from "../actions/order.actions";
import type { OrderDateChangeRequest } from "../types";

const initialState: ActionResult<OrderDateChangeRequest | null> = { success: true, errorCode: null, message: "", data: null };

export function OrderDateChangeDialog({ orderHistoryId, currentDate }: { orderHistoryId: string; currentDate: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(createOrderDateChangeRequestAction, initialState);

  useEffect(() => {
    if (state.success && state.data) dialogRef.current?.close();
  }, [state]);

  return <>
    <button className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-700 px-3 text-sm font-semibold text-emerald-800" onClick={() => dialogRef.current?.showModal()} type="button">
      <CalendarClock className="size-4" />Запросить перенос даты
    </button>
    <dialog className="w-[min(32rem,calc(100%-2rem))] rounded-lg p-0 backdrop:bg-zinc-950/40" ref={dialogRef}>
      <form action={action} className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-semibold">Перенос планируемой отгрузки</h2><p className="mt-1 text-sm text-zinc-600">Дата изменится в кабинете только после обновления заказа в 1С.</p></div>
          <button aria-label="Закрыть" className="rounded p-1 text-zinc-500 hover:bg-zinc-100" onClick={() => dialogRef.current?.close()} type="button"><X className="size-5" /></button>
        </div>
        <input name="orderHistoryId" type="hidden" value={orderHistoryId} />
        <label className="block text-sm font-medium">Текущая дата<input className="mt-1 h-10 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3" readOnly value={currentDate} /></label>
        <label className="block text-sm font-medium">Новая дата<input className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3" min={tomorrow()} name="requestedDate" required type="date" /></label>
        <label className="block text-sm font-medium">Комментарий, необязательно<textarea className="mt-1 min-h-24 w-full rounded-md border border-zinc-300 p-3" maxLength={1000} name="comment" /></label>
        {state.message && <p aria-live="polite" className={`text-sm ${state.success ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
        <div className="flex justify-end gap-3"><button className="h-10 px-3 text-sm font-semibold" onClick={() => dialogRef.current?.close()} type="button">Отмена</button><button className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Отправка..." : "Отправить запрос"}</button></div>
      </form>
    </dialog>
  </>;
}

export function CancelOrderDateChangeButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  return <button className="text-sm font-semibold text-zinc-600 underline" disabled={pending} onClick={() => startTransition(() => void cancelOrderDateChangeRequestAction(requestId))} type="button">{pending ? "Отмена..." : "Отменить запрос"}</button>;
}

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}
