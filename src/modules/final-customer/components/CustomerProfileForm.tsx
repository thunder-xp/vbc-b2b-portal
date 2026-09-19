"use client";

import { useActionState } from "react";

import { updateCustomerProfileAction } from "../actions";
import type { FinalCustomerLocale } from "../locale";
import { finalCustomerCopy } from "../copy";

export function CustomerProfileForm({
  locale,
  displayName,
  email,
  verifiedPhone,
}: {
  locale: FinalCustomerLocale;
  displayName: string | null;
  email: string | null;
  verifiedPhone: string;
}) {
  const labels = finalCustomerCopy[locale];
  const [state, action, pending] = useActionState(updateCustomerProfileAction, { error: null, saved: false });
  return (
    <form action={action} className="grid max-w-xl gap-5 rounded-xl border border-zinc-200 bg-white p-5">
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        {labels.name}
        <input className="h-11 rounded-lg border border-zinc-300 px-3 outline-none focus:border-emerald-700" defaultValue={displayName ?? ""} maxLength={160} name="displayName" />
      </label>
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        {labels.email}
        <input autoComplete="email" className="h-11 rounded-lg border border-zinc-300 px-3 outline-none focus:border-emerald-700" defaultValue={email ?? ""} maxLength={254} name="email" type="email" />
        <span className="text-xs font-normal leading-5 text-zinc-500">{labels.emailHelp}</span>
      </label>
      <div className="rounded-lg bg-zinc-50 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{labels.verifiedPhone}</p>
        <p className="mt-1 font-mono text-sm font-semibold text-zinc-900">{verifiedPhone}</p>
        <p className="mt-2 text-xs leading-5 text-zinc-500">{labels.phoneChange}</p>
      </div>
      {state.error ? <p aria-live="polite" className="text-sm text-red-700">{labels.profileError}</p> : null}
      {state.saved ? <p aria-live="polite" className="text-sm text-emerald-700">{labels.saved}</p> : null}
      <button className="min-h-11 justify-self-start rounded-lg bg-zinc-950 px-5 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={pending} type="submit">{labels.save}</button>
    </form>
  );
}
