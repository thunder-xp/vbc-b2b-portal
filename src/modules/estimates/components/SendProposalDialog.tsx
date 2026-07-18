"use client";

import { Copy, Mail, Send, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { revokeProposalDeliveryAction, sendProposalDeliveryAction } from "../actions/delivery.actions";
import type { ProposalDeliverySummaryDto } from "../types";

export function SendProposalDialog({ versionId, versionLabel, deliveries, canSend, defaults }: {
  versionId: string;
  versionLabel: string;
  deliveries: ProposalDeliverySummaryDto[];
  canSend: boolean;
  defaults?: { recipientName: string; subject: string; message: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const send = (formData: FormData) => startTransition(async () => {
    const result = await sendProposalDeliveryAction({
      versionId,
      recipientEmail: String(formData.get("recipientEmail") ?? ""),
      recipientName: String(formData.get("recipientName") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      message: String(formData.get("message") ?? ""),
      locale: formData.get("locale") === "ro" ? "ro" : "ru",
      expirationDays: Number(formData.get("expirationDays")),
      attachPdf: formData.get("attachPdf") === "on",
      idempotencyKey: crypto.randomUUID(),
    });
    setMessage(result.message);
    if (result.success) {
      setPublicUrl(result.data.publicUrl);
      router.refresh();
    }
  });

  return <>
    {canSend && <button className={secondary} onClick={() => { setMessage(null); setPublicUrl(null); setOpen(true); }} type="button"><Mail className="size-4" />Отправить</button>}
    {open && <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog">
      <form action={send} className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl">
        <header className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-semibold">Отправка предложения</h3><p className="mt-1 text-sm text-zinc-500">{versionLabel}</p></div><button aria-label="Закрыть" className="grid size-9 place-items-center" onClick={() => setOpen(false)} type="button"><X className="size-5" /></button></header>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Email получателя"><input className={input} maxLength={254} name="recipientEmail" required type="email" /></Field>
          <Field label="Имя получателя"><input className={input} defaultValue={defaults?.recipientName} maxLength={160} name="recipientName" /></Field>
          <Field className="sm:col-span-2" label="Тема"><input className={input} defaultValue={defaults?.subject ?? `Коммерческое предложение ${versionLabel}`} maxLength={200} name="subject" required /></Field>
          <Field className="sm:col-span-2" label="Сообщение"><textarea className={`${input} min-h-24 py-2`} defaultValue={defaults?.message} maxLength={4000} name="message" /></Field>
          <Field label="Язык письма"><select className={input} defaultValue="ru" name="locale"><option value="ru">Русский</option><option value="ro">Română</option></select></Field>
          <Field label="Срок ссылки"><select className={input} defaultValue="14" name="expirationDays"><option value="7">7 дней</option><option value="14">14 дней</option><option value="30">30 дней</option></select></Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm"><input defaultChecked name="attachPdf" type="checkbox" />Приложить PDF, если размер позволяет</label>
        {message && <p aria-live="polite" className="mt-4 bg-zinc-50 px-3 py-2 text-sm">{message}</p>}
        {publicUrl && <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"><input aria-label="Защищённая ссылка" className={input} readOnly value={publicUrl} /><button className={secondary} onClick={async () => { await navigator.clipboard.writeText(publicUrl); setMessage("Ссылка скопирована."); }} type="button"><Copy className="size-4" />Скопировать</button></div>}
        <footer className="mt-5 flex justify-end gap-2"><button className={secondary} onClick={() => setOpen(false)} type="button">Отмена</button><button className={primary} disabled={pending} type="submit"><Send className="size-4" />{pending ? "Отправка..." : "Отправить"}</button></footer>
      </form>
    </div>}
    {deliveries.length > 0 && <div className="mt-3 w-full space-y-2">
      {deliveries.map((delivery) => <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-emerald-600 bg-zinc-50 px-3 py-2 text-xs" key={delivery.id}>
        <span><strong>{delivery.recipient}</strong> · {delivery.statusLabel}{delivery.openedAt ? ` · Открыто ${formatDate(delivery.openedAt)}` : ""}{delivery.response ? ` · ${delivery.response === "accepted" ? "Принято" : "Отклонено"}` : ""}</span>
        {!delivery.response && delivery.status !== "revoked" && <button className="font-semibold text-red-700" disabled={pending} onClick={() => startTransition(async () => { const result = await revokeProposalDeliveryAction(delivery.id); setMessage(result.message); if (result.success) router.refresh(); })} type="button">Отозвать ссылку</button>}
      </div>)}
    </div>}
  </>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={`grid gap-1 text-sm font-medium ${className}`}>{label}{children}</label>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
const input = "h-10 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primary = "inline-flex h-10 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45";
const secondary = "inline-flex h-10 items-center justify-center gap-2 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 disabled:opacity-45";
