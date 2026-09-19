"use client";

import { useActionState } from "react";
import { replyToCustomerServiceRequestAction } from "../actions";
import { ServiceAttachmentPicker } from "./ServiceAttachmentPicker";
import { CabinetFeedback, cabinetField, cabinetPrimaryAction, cabinetSurface } from "@/src/modules/cabinet-experience/components";

const initial = { error: null, sent: false, submissionId: 0 };

export function CustomerServiceReplyForm({ requestId, expectedVersion, locale }: { requestId: string; expectedVersion: number; locale: "ru" | "ro" }) {
  const [state, action, pending] = useActionState(replyToCustomerServiceRequestAction, initial);
  const ro = locale === "ro";
  return <form action={action} className={`space-y-4 p-4 sm:p-5 ${cabinetSurface}`}>
    <input name="requestId" type="hidden" value={requestId} /><input name="expectedVersion" type="hidden" value={expectedVersion} />
    <label className="block text-sm font-medium text-zinc-800">{ro ? "Mesaj" : "Сообщение"}<textarea className={`${cabinetField} mt-1.5 min-h-28 py-3`} key={`body-${state.submissionId}`} maxLength={4000} minLength={1} name="body" placeholder={ro ? "Scrieți mesajul" : "Введите сообщение"} required /></label>
    <ServiceAttachmentPicker key={`files-${state.submissionId}`} locale={locale} />
    {state.error ? <CabinetFeedback tone={state.sent ? "conflict" : "error"}>{state.sent ? (ro ? "Mesajul a fost trimis, dar fișierele nu au putut fi încărcate." : "Сообщение отправлено, но файлы загрузить не удалось.") : (ro ? "Mesajul nu a putut fi trimis." : "Не удалось отправить сообщение.")}</CabinetFeedback> : null}
    {state.sent ? <CabinetFeedback tone="saved">{ro ? "Mesaj trimis." : "Сообщение отправлено."}</CabinetFeedback> : null}
    <button className={cabinetPrimaryAction} disabled={pending}>{pending ? (ro ? "Se trimite…" : "Отправляем…") : (ro ? "Trimite" : "Отправить")}</button>
  </form>;
}
