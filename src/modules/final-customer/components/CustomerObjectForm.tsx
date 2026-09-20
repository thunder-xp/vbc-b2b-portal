"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { saveCustomerObjectAction } from "../actions";
import { customerObjectTypeLabels } from "../object-copy";
import { CUSTOMER_OBJECT_TYPES, type CustomerObjectType } from "../types";
import type { FinalCustomerLocale } from "../locale";
import { CabinetFeedback, cabinetField, cabinetPrimaryAction, cabinetSurface } from "@/src/modules/cabinet-experience/components";

const initial = { error: null, savedId: null, submissionId: 0 };

export function CustomerObjectForm({
  locale,
  object,
  retailOrderId = "",
}: {
  locale: FinalCustomerLocale;
  object?: { id: string; name: string; objectType: CustomerObjectType; locality: string | null; addressLabel: string | null; version: number };
  retailOrderId?: string;
}) {
  const [state, action, pending] = useActionState(saveCustomerObjectAction, initial);
  const router = useRouter();
  const ro = locale === "ro";
  useEffect(() => { if (state.savedId) router.replace(`/account/objects/${state.savedId}`); }, [router, state.savedId]);

  return <form action={action} className={`space-y-4 p-4 sm:p-5 ${cabinetSurface}`}>
    <input name="objectId" type="hidden" value={object?.id ?? ""} />
    <input name="expectedVersion" type="hidden" value={object?.version ?? 0} />
    <input name="retailOrderId" type="hidden" value={retailOrderId} />
    <label className="block text-sm font-medium text-zinc-800">{ro ? "Denumirea obiectului" : "Название объекта"}<input className={`${cabinetField} mt-1.5`} defaultValue={object?.name ?? ""} maxLength={120} minLength={2} name="name" placeholder={ro ? "Casa mea" : "Дом"} required /></label>
    <label className="block text-sm font-medium text-zinc-800">{ro ? "Tipul obiectului" : "Тип объекта"}<select className={`${cabinetField} mt-1.5`} defaultValue={object?.objectType ?? "HOME"} name="objectType">{CUSTOMER_OBJECT_TYPES.map((type) => <option key={type} value={type}>{customerObjectTypeLabels[locale][type]}</option>)}</select></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium text-zinc-800">{ro ? "Localitate (opțional)" : "Населённый пункт (необязательно)"}<input className={`${cabinetField} mt-1.5`} defaultValue={object?.locality ?? ""} maxLength={120} name="locality" /></label>
      <label className="block text-sm font-medium text-zinc-800">{ro ? "Reper de adresă (opțional)" : "Ориентир / адрес (необязательно)"}<input className={`${cabinetField} mt-1.5`} defaultValue={object?.addressLabel ?? ""} maxLength={200} name="addressLabel" /></label>
    </div>
    <p className="text-xs leading-5 text-zinc-500">{ro ? "Adresa poștală completă nu este necesară. Puteți folosi o denumire ușor de recunoscut." : "Полный почтовый адрес не требуется. Можно указать удобный для вас ориентир."}</p>
    {state.error ? <CabinetFeedback tone="error">{ro ? "Obiectul nu a putut fi salvat." : "Не удалось сохранить объект."}</CabinetFeedback> : null}
    <button className={cabinetPrimaryAction} disabled={pending} type="submit">{pending ? (ro ? "Se salvează…" : "Сохраняем…") : object ? (ro ? "Salvează modificările" : "Сохранить изменения") : (ro ? "Creează obiectul" : "Создать объект")}</button>
  </form>;
}
