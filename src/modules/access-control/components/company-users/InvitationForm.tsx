"use client";

import { Check, Copy, UserPlus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { createEmployeeInvitationAction, type CompanyUserMutationState } from "../../actions/company-users.actions";
import { companyCopy, usePartnerLocale } from "../../../partner-locale";

const INITIAL_STATE: CompanyUserMutationState = { success: false, message: null, invitationUrl: null };

export function InvitationForm({ companyId }: { companyId?: string }) {
  const copy = companyCopy(usePartnerLocale());
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(createEmployeeInvitationAction, INITIAL_STATE);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) dialogRef.current?.querySelector<HTMLElement>("input")?.focus(); }, [open]);

  return <>
    <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white" onClick={() => setOpen(true)} type="button"><UserPlus className="size-4" />{copy.inviteEmployee}</button>
    {open ? <div aria-labelledby="employee-invitation-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={(event) => { if (event.target === event.currentTarget && !pending) setOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape" && !pending) setOpen(false); }} role="dialog">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl" ref={dialogRef}>
        <header className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-zinc-950" id="employee-invitation-title">{copy.inviteEmployee}</h2><p className="mt-1 text-sm text-zinc-600">{copy.invitationEmailHint}</p></div><button aria-label={copy.close} className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-zinc-100" disabled={pending} onClick={() => setOpen(false)} type="button"><X className="size-5" /></button></header>
        <form action={action} className="mt-5 grid gap-4">
          {companyId ? <input name="companyId" type="hidden" value={companyId} /> : null}
          <Field label={copy.fullName} name="fullName" />
          <Field label={copy.email} name="email" type="email" />
          <label className="grid gap-2 text-sm font-medium text-zinc-800">{copy.role}<select className="h-11 rounded-md border border-zinc-300 bg-white px-3" defaultValue="partner_viewer" name="roleCode"><option value="partner_manager">{copy.managerRole}</option><option value="partner_buyer">{copy.buyerRole}</option><option value="partner_accounting">{copy.accountingRole}</option><option value="partner_viewer">{copy.viewerRole}</option></select></label>
          <label className="grid gap-2 text-sm font-medium text-zinc-800">{copy.priceAccess}<select className="h-11 rounded-md border border-zinc-300 bg-white px-3" defaultValue="full" name="priceAccess"><option value="full">{copy.commercialPrices}</option><option value="retail_only">{copy.retailPricesOnly}</option></select></label>
          {state.message ? <p className={`rounded-md px-3 py-2 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`} role="status">{state.success ? copy.invitationQueued : copy.actionFailed}</p> : null}
          {state.invitationUrl ? <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold" onClick={async () => { await navigator.clipboard.writeText(state.invitationUrl!); setCopied(true); }} type="button">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? copy.linkCopied : copy.copyLink}</button> : null}
          <button className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={pending}>{pending ? copy.sending : copy.invite}</button>
        </form>
      </div>
    </div> : null}
  </>;
}

function Field({ label, name, type = "text" }: { label: string; name: string; type?: string }) {
  return <label className="grid gap-2 text-sm font-medium text-zinc-800">{label}<input className="h-11 rounded-md border border-zinc-300 px-3" name={name} required type={type} /></label>;
}
