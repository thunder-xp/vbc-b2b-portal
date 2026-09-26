"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { createCustomerServiceRequestAction } from "../actions";
import { CUSTOMER_SERVICE_REQUEST_TYPES } from "../types";
import { serviceTypeLabel, type CustomerLocale } from "../presentation";
import { ServiceAttachmentPicker } from "./ServiceAttachmentPicker";
import { CabinetFeedback, cabinetField, cabinetPrimaryAction, cabinetSurface } from "@/src/modules/cabinet-experience/components";

const initial = { error: null, createdId: null };

export function CustomerServiceRequestForm({ locale, customerObjectId = "", orderId = "", orderLineId = "", defaultSubject = "" }: { locale: CustomerLocale; customerObjectId?: string; orderId?: string; orderLineId?: string; defaultSubject?: string }) {
  const [state, action, pending] = useActionState(createCustomerServiceRequestAction, initial);
  const router = useRouter();
  const ro = locale === "ro";
  useEffect(() => { if (state.createdId) router.push(`/account/service/${state.createdId}`); }, [router, state.createdId]);
  return <form action={action} className={`space-y-4 p-4 sm:p-5 ${cabinetSurface}`}>
    <input name="customerObjectId" type="hidden" value={customerObjectId} /><input name="orderId" type="hidden" value={orderId} /><input name="orderLineId" type="hidden" value={orderLineId} />
    <label className="block text-sm font-medium text-zinc-800">{ro ? "Tipul solicitării" : "Тип обращения"}<select className={`${cabinetField} mt-1.5`} name="type">{CUSTOMER_SERVICE_REQUEST_TYPES.map((type) => <option key={type} value={type}>{serviceTypeLabel(type, locale)}</option>)}</select></label>
    <label className="block text-sm font-medium text-zinc-800">{ro ? "Subiect" : "Тема"}<input className={`${cabinetField} mt-1.5`} defaultValue={defaultSubject} maxLength={160} minLength={3} name="subject" required /></label>
    <label className="block text-sm font-medium text-zinc-800">{ro ? "Descriere" : "Описание"}<textarea className={`${cabinetField} mt-1.5 min-h-28 py-3`} maxLength={2000} minLength={10} name="description" required /></label>
    <label className="block text-sm font-medium text-zinc-800">{ro ? "Contact preferat" : "Предпочтительный способ связи"}<select className={`${cabinetField} mt-1.5`} name="preferredContact"><option value="PHONE">{ro ? "Telefon" : "Телефон"}</option><option value="EMAIL">Email</option></select></label>
    <ServiceAttachmentPicker locale={locale} />
    {state.error ? <CabinetFeedback tone="error">{ro ? "Solicitarea nu a putut fi trimisă." : "Не удалось отправить обращение."}</CabinetFeedback> : null}
    <button className={cabinetPrimaryAction} disabled={pending}>{pending ? (ro ? "Se trimite…" : "Отправляем…") : (ro ? "Trimite solicitarea" : "Отправить обращение")}</button>
  </form>;
}
