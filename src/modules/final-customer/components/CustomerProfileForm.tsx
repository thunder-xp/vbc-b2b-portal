"use client";

import { useActionState } from "react";

import { updateCustomerProfileAction } from "../actions";
import type { FinalCustomerLocale } from "../locale";
import { finalCustomerCopy } from "../copy";
import { CabinetFeedback, cabinetField, cabinetPrimaryAction, cabinetSurface } from "@/src/modules/cabinet-experience/components";

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
    <form action={action} className={`grid max-w-2xl gap-4 p-4 sm:grid-cols-2 sm:p-5 ${cabinetSurface}`}>
      <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
        {labels.name}
        <input className={cabinetField} defaultValue={displayName ?? ""} maxLength={160} name="displayName" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
        {labels.email}
        <input autoComplete="email" className={cabinetField} defaultValue={email ?? ""} maxLength={254} name="email" type="email" />
        <span className="text-xs font-normal leading-5 text-zinc-500">{labels.emailHelp}</span>
      </label>
      <div className="rounded-lg bg-zinc-50 p-3 sm:col-span-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{labels.verifiedPhone}</p>
        <p className="mt-1 font-mono text-sm font-semibold text-zinc-900">{verifiedPhone}</p>
        <p className="mt-2 text-xs leading-5 text-zinc-500">{labels.phoneChange}</p>
      </div>
      {state.error ? <div className="sm:col-span-2"><CabinetFeedback tone="error">{labels.profileError}</CabinetFeedback></div> : null}
      {state.saved ? <div className="sm:col-span-2"><CabinetFeedback tone="saved">{labels.saved}</CabinetFeedback></div> : null}
      <button className={`${cabinetPrimaryAction} justify-self-start sm:col-span-2`} disabled={pending} type="submit">{pending ? `${labels.save}…` : labels.save}</button>
    </form>
  );
}
