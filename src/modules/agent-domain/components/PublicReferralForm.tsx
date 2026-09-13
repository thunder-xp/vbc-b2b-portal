"use client";

import { useActionState } from "react";

import { captureAgentReferralAction, type ReferralCaptureState } from "../actions";

const INITIAL_STATE: ReferralCaptureState = { success: false, message: "" };

export function PublicReferralForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(captureAgentReferralAction, INITIAL_STATE);
  if (state.success) return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950" role="status"><h1 className="text-2xl font-semibold">Спасибо</h1><p className="mt-2">{state.message}</p></div>;
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-7">
      <input name="token" type="hidden" value={token} />
      <label className="text-sm font-medium">Тип клиента<select className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" name="customerKind"><option value="PERSON">Физическое лицо</option><option value="LEGAL_ENTITY">Юридическое лицо</option></select></label>
      <label className="text-sm font-medium">Имя / название<input className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" maxLength={200} minLength={2} name="name" required /></label>
      <label className="text-sm font-medium">Телефон в формате +373…<input className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" inputMode="tel" name="phone" /></label>
      <label className="text-sm font-medium">Email<input className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" name="email" type="email" /></label>
      <label className="text-sm font-medium">IDNO / IDNP (если применимо)<input className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" maxLength={32} name="legalIdentifier" /></label>
      <label className="text-sm font-medium">Населённый пункт<input className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" maxLength={120} name="locality" /></label>
      <label className="text-sm font-medium sm:col-span-2">Что требуется<textarea className="mt-1 min-h-28 w-full rounded-md border border-zinc-300 p-3" maxLength={500} minLength={2} name="needSummary" required /></label>
      <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2"><input className="mt-1 size-5" name="consent" required type="checkbox" /><span>Согласен(на) на обработку указанных контактных данных для рассмотрения заявки и связи со мной.</span></label>
      {state.message ? <p className="text-sm text-red-700 sm:col-span-2" role="alert">{state.message}</p> : null}
      <button className="min-h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2" disabled={pending} type="submit">Отправить заявку</button>
    </form>
  );
}
