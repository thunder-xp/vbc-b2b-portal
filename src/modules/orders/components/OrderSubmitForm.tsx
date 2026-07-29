"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "../../access-control/actions/action-result";
import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import {
  submitCartOrderAction,
  type PartnerOrderSubmissionReceipt,
} from "../actions/order.actions";

const initial: ActionResult<PartnerOrderSubmissionReceipt | null> = { success: true, errorCode: null, message: "", data: null };

export function OrderSubmitForm({ submissionKey }: { submissionKey: string }) {
  const [state, action, pending] = useActionState(submitCartOrderAction, initial);
  const submissionKeyRef = useRef<HTMLInputElement>(null);
  const [deliveryDate, setDeliveryDate] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (state.success && state.data?.id) {
      recordBehaviorInteraction({ eventName: "order_submitted", route: "/cabinet/cart", sourceSurface: "checkout" });
      router.push(`/cabinet/orders/${state.data.id}?submitted=1`);
    }
  }, [router, state]);
  useEffect(() => {
    if (!state.success && isDefinitiveRecoverableFailure(state.errorCode) && submissionKeyRef.current) {
      submissionKeyRef.current.value = crypto.randomUUID();
    }
  }, [state]);
  const retryBlocked = !state.success && ["ORDER_IN_PROGRESS", "ORDER_RECONCILIATION_REQUIRED"].includes(state.errorCode);
  return <form action={action} aria-label="Проверка и отправка заказа" className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
    <input defaultValue={submissionKey} name="submissionKey" ref={submissionKeyRef} type="hidden" />
    <div><h2 className="font-semibold text-zinc-950">Проверка заказа</h2><p className="mt-1 text-xs leading-5 text-zinc-600">Проверьте состав, количество и итоговую сумму перед отправкой.</p></div>
    <label className="block text-sm font-medium text-zinc-800">Дата планируемой отгрузки<input className="mt-1 block h-10 w-full rounded-md border border-zinc-300 px-3" min={new Date().toISOString().slice(0, 10)} name="requestedDeliveryDate" onChange={(event) => setDeliveryDate(event.target.value)} required type="date" value={deliveryDate} /></label>
    <p className="text-xs leading-5 text-zinc-600">До этой даты оборудование планируется удерживать под ваш заказ. Менеджер Novotech свяжется с вами для подтверждения отгрузки.</p>
    <p className="rounded-md bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">Заказ будет передан в 1С Novotech. После обработки статус появится в разделе «Заказы».</p>
    <button className="h-11 w-full rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60" disabled={pending || retryBlocked} type="submit">{pending ? "Отправка заказа..." : "Отправить заказ"}</button>
    {state.message && <p aria-live="polite" className={`text-sm ${state.success ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
  </form>;
}

function isDefinitiveRecoverableFailure(code: string | null): boolean {
  return code !== null && ![
    "ORDER_IN_PROGRESS",
    "ORDER_RECONCILIATION_REQUIRED",
    "ORDER_1C_TIMEOUT",
    "ORDER_1C_ALREADY_CREATED",
    "ORDER_READBACK_FAILED",
  ].includes(code);
}
