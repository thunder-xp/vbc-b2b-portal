"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { submitPublicProposalResponseAction } from "../actions/delivery.actions";
import type { ProposalCustomerResponse } from "../types";

export function PublicProposalResponse({ token, initialResponse, locale }: { token: string; initialResponse: ProposalCustomerResponse | null; locale: "ru" | "ro" }) {
  const [response, setResponse] = useState(initialResponse);
  const [choice, setChoice] = useState<ProposalCustomerResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const copy = locale === "ro" ? ro : ru;
  if (response) return <section className="border-y border-emerald-200 bg-emerald-50 px-5 py-5 text-center"><CheckCircle2 className="mx-auto size-7 text-emerald-700" /><p className="mt-2 font-semibold">{response === "accepted" ? copy.accepted : copy.rejected}</p></section>;
  const submit = (formData: FormData) => {
    if (!choice) return;
    startTransition(async () => {
      const result = await submitPublicProposalResponseAction(token, choice, String(formData.get("name") ?? ""), String(formData.get("note") ?? ""));
      setMessage(result.message);
      if (result.success) setResponse(result.data.response);
    });
  };
  return <section className="border-y border-zinc-200 bg-white px-5 py-6">
    <div className="mx-auto max-w-2xl"><h2 className="text-lg font-semibold">{copy.title}</h2><p className="mt-1 text-sm text-zinc-500">{copy.disclaimer}</p>
      {!choice ? <div className="mt-4 flex flex-wrap gap-3"><button className={primary} onClick={() => setChoice("accepted")} type="button"><CheckCircle2 className="size-4" />{copy.accept}</button><button className={danger} onClick={() => setChoice("rejected")} type="button"><XCircle className="size-4" />{copy.reject}</button></div> : <form action={submit} className="mt-4 grid gap-3">
        <p className="font-semibold">{choice === "accepted" ? copy.confirmAccept : copy.confirmReject}</p>
        <input className={input} maxLength={160} name="name" placeholder={copy.name} />
        <textarea className={`${input} min-h-24 py-2`} maxLength={2000} name="note" placeholder={copy.note} />
        <div className="flex gap-2"><button className={secondary} onClick={() => setChoice(null)} type="button">{copy.back}</button><button className={choice === "accepted" ? primary : danger} disabled={pending} type="submit">{pending ? copy.saving : copy.confirm}</button></div>
      </form>}
      {message && <p aria-live="polite" className="mt-3 text-sm">{message}</p>}
    </div>
  </section>;
}

const input = "w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primary = "inline-flex h-10 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45";
const secondary = "inline-flex h-10 items-center justify-center gap-2 border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700";
const danger = "inline-flex h-10 items-center justify-center gap-2 border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 disabled:opacity-45";
const ru = { title: "Ваш ответ", disclaimer: "Подтвердите решение. Это не является квалифицированной электронной подписью.", accept: "Принять", reject: "Отклонить", accepted: "Предложение принято", rejected: "Ответ об отклонении получен", confirmAccept: "Подтвердите принятие", confirmReject: "Подтвердите отклонение", name: "Ваше имя (необязательно)", note: "Комментарий (необязательно)", back: "Назад", saving: "Сохранение...", confirm: "Подтвердить" };
const ro = { title: "Răspunsul dumneavoastră", disclaimer: "Confirmați decizia. Acest răspuns nu reprezintă o semnătură electronică calificată.", accept: "Acceptă", reject: "Respinge", accepted: "Oferta a fost acceptată", rejected: "Răspunsul de respingere a fost primit", confirmAccept: "Confirmați acceptarea", confirmReject: "Confirmați respingerea", name: "Numele dumneavoastră (opțional)", note: "Comentariu (opțional)", back: "Înapoi", saving: "Se salvează...", confirm: "Confirmă" };
