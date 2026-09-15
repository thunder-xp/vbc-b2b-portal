"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { createCustomerServiceRequestAction } from "../actions";
import { CUSTOMER_SERVICE_REQUEST_TYPES } from "../types";
import { serviceTypeLabel, type CustomerLocale } from "../presentation";

const initial = { error: null, createdId: null };
const field = "min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";

export function CustomerServiceRequestForm({ locale, orderId = "", orderLineId = "" }: { locale: CustomerLocale; orderId?: string; orderLineId?: string }) {
  const [state, action, pending] = useActionState(createCustomerServiceRequestAction, initial);
  const router = useRouter();
  const ro = locale === "ro";
  useEffect(() => { if (state.createdId) router.push(`/account/service/${state.createdId}`); }, [router, state.createdId]);
  return <form action={action} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
    <input name="orderId" type="hidden" value={orderId} /><input name="orderLineId" type="hidden" value={orderLineId} />
    <label className="block text-sm font-medium">{ro ? "Tipul solicitării" : "Тип обращения"}<select className={`${field} mt-1`} name="type">{CUSTOMER_SERVICE_REQUEST_TYPES.map((type) => <option key={type} value={type}>{serviceTypeLabel(type, locale)}</option>)}</select></label>
    <label className="block text-sm font-medium">{ro ? "Subiect" : "Тема"}<input className={`${field} mt-1`} maxLength={160} minLength={3} name="subject" required /></label>
    <label className="block text-sm font-medium">{ro ? "Descriere" : "Описание"}<textarea className="mt-1 min-h-32 w-full rounded-lg border border-zinc-300 p-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" maxLength={2000} minLength={10} name="description" required /></label>
    <label className="block text-sm font-medium">{ro ? "Contact preferat" : "Предпочтительный способ связи"}<select className={`${field} mt-1`} name="preferredContact"><option value="PHONE">{ro ? "Telefon" : "Телефон"}</option><option value="EMAIL">Email</option></select></label>
    {state.error ? <p className="text-sm text-red-700" role="alert">{ro ? "Solicitarea nu a putut fi trimisă." : "Не удалось отправить обращение."}</p> : null}
    <button className="min-h-11 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={pending}>{pending ? (ro ? "Se trimite…" : "Отправляем…") : (ro ? "Trimite solicitarea" : "Отправить обращение")}</button>
  </form>;
}
