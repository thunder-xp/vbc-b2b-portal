"use client";

import { Check, Copy, UserPlus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { createEmployeeInvitationAction, type CompanyUserMutationState } from "../../actions/company-users.actions";

const INITIAL_STATE: CompanyUserMutationState = { success: false, message: null, invitationUrl: null };

export function InvitationForm({ companyId }: { companyId?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(createEmployeeInvitationAction, INITIAL_STATE);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) dialogRef.current?.querySelector<HTMLElement>("input")?.focus(); }, [open]);

  return <>
    <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white" onClick={() => setOpen(true)} type="button"><UserPlus className="size-4" />Пригласить сотрудника</button>
    {open ? <div aria-labelledby="employee-invitation-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={(event) => { if (event.target === event.currentTarget && !pending) setOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape" && !pending) setOpen(false); }} role="dialog">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl" ref={dialogRef}>
        <header className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-zinc-950" id="employee-invitation-title">Пригласить сотрудника</h2><p className="mt-1 text-sm text-zinc-600">Письмо со ссылкой будет отправлено автоматически.</p></div><button aria-label="Закрыть" className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-zinc-100" disabled={pending} onClick={() => setOpen(false)} type="button"><X className="size-5" /></button></header>
        <form action={action} className="mt-5 grid gap-4">
          {companyId ? <input name="companyId" type="hidden" value={companyId} /> : null}
          <Field label="Имя" name="fullName" />
          <Field label="Email" name="email" type="email" />
          <label className="grid gap-2 text-sm font-medium text-zinc-800">Роль<select className="h-11 rounded-md border border-zinc-300 bg-white px-3" defaultValue="partner_viewer" name="roleCode"><option value="partner_manager">Менеджер — сотрудники и продажи</option><option value="partner_buyer">Покупатель — каталог и заказы</option><option value="partner_accounting">Бухгалтер — финансы и документы</option><option value="partner_viewer">Наблюдатель — просмотр</option></select></label>
          <label className="grid gap-2 text-sm font-medium text-zinc-800">Доступ к ценам<select className="h-11 rounded-md border border-zinc-300 bg-white px-3" defaultValue="full" name="priceAccess"><option value="full">Коммерческие цены</option><option value="retail_only">Только розничные цены</option></select></label>
          {state.message ? <p className={`rounded-md px-3 py-2 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`} role="status">{state.message}</p> : null}
          {state.invitationUrl ? <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold" onClick={async () => { await navigator.clipboard.writeText(state.invitationUrl!); setCopied(true); }} type="button">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Ссылка скопирована" : "Скопировать ссылку"}</button> : null}
          <button className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={pending}>{pending ? "Отправляем..." : "Пригласить"}</button>
        </form>
      </div>
    </div> : null}
  </>;
}

function Field({ label, name, type = "text" }: { label: string; name: string; type?: string }) {
  return <label className="grid gap-2 text-sm font-medium text-zinc-800">{label}<input className="h-11 rounded-md border border-zinc-300 px-3" name={name} required type={type} /></label>;
}
