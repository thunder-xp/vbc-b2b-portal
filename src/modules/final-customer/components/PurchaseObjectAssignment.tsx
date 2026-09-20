"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { linkCustomerObjectPurchaseAction } from "../actions";
import type { CustomerObjectSummary } from "../types";
import type { FinalCustomerLocale } from "../locale";
import { cabinetField, cabinetPrimaryAction, cabinetSecondaryAction, cabinetSurface } from "@/src/modules/cabinet-experience/components";

export function PurchaseObjectAssignment({
  locale,
  orderId,
  orderNumber,
  objects,
  currentObjectName = null,
}: {
  locale: FinalCustomerLocale;
  orderId: string;
  orderNumber: string;
  objects: CustomerObjectSummary[];
  currentObjectName?: string | null;
}) {
  const [skipped, setSkipped] = useState(false);
  const [state, action, pending] = useActionState(linkCustomerObjectPurchaseAction, { error: null, submissionId: 0 });
  const ro = locale === "ro";
  if (skipped) return null;
  return <section className={`p-4 sm:p-5 ${cabinetSurface}`} aria-labelledby={`object-prompt-${orderId}`}>
    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{ro ? `Comanda ${orderNumber}` : `Заказ ${orderNumber}`}</p>
    <h2 className="mt-1 text-lg font-semibold" id={`object-prompt-${orderId}`}>{currentObjectName ? (ro ? `Obiect curent: ${currentObjectName}` : `Текущий объект: ${currentObjectName}`) : (ro ? "De ce obiect ține acest sistem?" : "К какому объекту относится эта система?")}</h2>
    <p className="mt-1 text-sm text-zinc-600">{ro ? "Asocierea organizează cumpărăturile și service-ul. Nu confirmă instalarea sau garanția." : "Привязка упорядочивает покупки и сервис. Она не подтверждает установку или гарантию."}</p>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
      {objects.length ? <form action={action} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end">
        <input name="retailOrderId" type="hidden" value={orderId} />
        <label className="min-w-0 flex-1 text-sm font-medium text-zinc-800">{currentObjectName ? (ro ? "Mută la obiect" : "Переместить в объект") : (ro ? "Obiect existent" : "Существующий объект")}<select className={`${cabinetField} mt-1.5`} name="objectId" required>{objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label>
        <button className={cabinetPrimaryAction} disabled={pending} type="submit">{pending ? (ro ? "Se salvează…" : "Сохранение…") : currentObjectName ? (ro ? "Mută" : "Переместить") : (ro ? "Leagă" : "Привязать")}</button>
      </form> : null}
      {!currentObjectName ? <Link className={objects.length ? cabinetSecondaryAction : cabinetPrimaryAction} href={`/account/objects/new?purchaseId=${orderId}`}>{ro ? "Obiect nou" : "Создать объект"}</Link> : null}
      <button className={cabinetSecondaryAction} onClick={() => setSkipped(true)} type="button">{ro ? "Omite" : "Пропустить"}</button>
    </div>
    {state.error ? <p className="mt-3 text-sm font-medium text-red-700" role="alert">{ro ? "Cumpărătura nu poate fi mutată. Verificați obiectul și solicitările de service asociate." : "Покупку нельзя переместить. Проверьте объект и связанные обращения в сервис."}</p> : null}
  </section>;
}
