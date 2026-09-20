"use client";

import { useState } from "react";
import Link from "next/link";

import { linkCustomerObjectPurchaseAction } from "../actions";
import type { CustomerObjectSummary } from "../types";
import type { FinalCustomerLocale } from "../locale";
import { cabinetField, cabinetPrimaryAction, cabinetSecondaryAction, cabinetSurface } from "@/src/modules/cabinet-experience/components";

export function PurchaseObjectAssignment({ locale, orderId, orderNumber, objects }: { locale: FinalCustomerLocale; orderId: string; orderNumber: string; objects: CustomerObjectSummary[] }) {
  const [skipped, setSkipped] = useState(false);
  const ro = locale === "ro";
  if (skipped) return null;
  return <section className={`p-4 sm:p-5 ${cabinetSurface}`} aria-labelledby={`object-prompt-${orderId}`}>
    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{ro ? `Comanda ${orderNumber}` : `Заказ ${orderNumber}`}</p>
    <h2 className="mt-1 text-lg font-semibold" id={`object-prompt-${orderId}`}>{ro ? "De ce obiect ține acest sistem?" : "К какому объекту относится эта система?"}</h2>
    <p className="mt-1 text-sm text-zinc-600">{ro ? "Legătura organizează cumpărăturile și service-ul. Nu confirmă instalarea sau garanția." : "Привязка упорядочивает покупки и сервис. Она не подтверждает установку или гарантию."}</p>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
      {objects.length ? <form action={linkCustomerObjectPurchaseAction} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end">
        <input name="retailOrderId" type="hidden" value={orderId} />
        <label className="min-w-0 flex-1 text-sm font-medium text-zinc-800">{ro ? "Obiect existent" : "Существующий объект"}<select className={`${cabinetField} mt-1.5`} name="objectId" required>{objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label>
        <button className={cabinetPrimaryAction} type="submit">{ro ? "Leagă" : "Привязать"}</button>
      </form> : null}
      <Link className={objects.length ? cabinetSecondaryAction : cabinetPrimaryAction} href={`/account/objects/new?purchaseId=${orderId}`}>{ro ? "Obiect nou" : "Создать объект"}</Link>
      <button className={cabinetSecondaryAction} onClick={() => setSkipped(true)} type="button">{ro ? "Omite" : "Пропустить"}</button>
    </div>
  </section>;
}
