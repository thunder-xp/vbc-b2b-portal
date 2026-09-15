"use client";

import { useActionState } from "react";
import { replyToCustomerServiceRequestAction } from "../actions";
import { ServiceAttachmentPicker } from "./ServiceAttachmentPicker";

const initial = { error: null, sent: false, submissionId: 0 };

export function CustomerServiceReplyForm({ requestId, expectedVersion, locale }: { requestId: string; expectedVersion: number; locale: "ru" | "ro" }) {
  const [state, action, pending] = useActionState(replyToCustomerServiceRequestAction, initial);
  const ro = locale === "ro";
  return <form action={action} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
    <input name="requestId" type="hidden" value={requestId} /><input name="expectedVersion" type="hidden" value={expectedVersion} />
    <label className="block text-sm font-medium">{ro ? "Mesaj" : "Сообщение"}<textarea className="mt-1 min-h-28 w-full rounded-lg border border-zinc-300 p-3 text-sm" key={`body-${state.submissionId}`} maxLength={4000} minLength={1} name="body" placeholder={ro ? "Scrieți mesajul" : "Введите сообщение"} required /></label>
    <ServiceAttachmentPicker key={`files-${state.submissionId}`} locale={locale} />
    {state.error ? <p className="text-sm text-red-700" role="alert">{state.sent ? (ro ? "Mesajul a fost trimis, dar fișierele nu au putut fi încărcate." : "Сообщение отправлено, но файлы загрузить не удалось.") : (ro ? "Mesajul nu a putut fi trimis." : "Не удалось отправить сообщение.")}</p> : null}
    {state.sent ? <p className="text-sm text-emerald-700" role="status">{ro ? "Mesaj trimis." : "Сообщение отправлено."}</p> : null}
    <button className="min-h-11 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={pending}>{pending ? (ro ? "Se trimite…" : "Отправляем…") : (ro ? "Trimite" : "Отправить")}</button>
  </form>;
}
