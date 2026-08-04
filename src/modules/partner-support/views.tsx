import Link from "next/link";

import {
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUS_LABELS,
  type SupportTicketDetail,
  type SupportTicketPage,
} from "./types";

export function SupportTicketList({ page, admin = false }: { page: SupportTicketPage; admin?: boolean }) {
  if (!page.items.length) {
    return <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center"><h2 className="font-semibold">Заявок пока нет</h2><p className="mt-2 text-sm text-zinc-600">Новая заявка появится здесь после отправки.</p></div>;
  }

  return <div className="overflow-hidden rounded-md border border-zinc-200 bg-white"><ul className="divide-y divide-zinc-200">{page.items.map((item) => <li key={item.id}>
    <Link className="grid min-h-20 gap-2 p-4 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:grid-cols-[160px_minmax(0,1fr)_170px_150px] sm:items-center" href={`${admin ? "/admin" : "/cabinet"}/support/${item.id}`} prefetch={false}>
      <div><p className="font-semibold">{item.ticketNumber}</p><p className="text-xs text-zinc-500">{new Date(item.createdAt).toLocaleDateString("ru-RU")}</p></div>
      <div><p className="line-clamp-2 text-sm text-zinc-800">{item.description}</p>{item.companyName ? <p className="mt-1 text-xs text-zinc-500">{item.companyName} · {item.applicantName}</p> : null}</div>
      <div className="text-sm"><p>{SUPPORT_STATUS_LABELS[item.status]}</p><p className="text-xs text-zinc-500">{SUPPORT_PRIORITY_LABELS[item.effectivePriority]}</p>{admin ? <p className="mt-1 truncate text-xs text-zinc-500">{item.assignedInternalUserName ?? "Не назначена"}</p> : null}</div>
      <span className={item.overdue ? "text-sm font-medium text-rose-700" : "text-sm text-zinc-500"}>{item.overdue ? "Просрочено" : item.nextAction ?? new Date(item.updatedAt).toLocaleDateString("ru-RU")}</span>
    </Link>
  </li>)}</ul></div>;
}

export function SupportTicketSummary({ detail, internal = false }: { detail: SupportTicketDetail; internal?: boolean }) {
  return <div className="space-y-6">
    <section className="grid gap-4 border-b border-zinc-200 pb-6 sm:grid-cols-3"><Metric label="Статус" value={SUPPORT_STATUS_LABELS[detail.status]} /><Metric label="Приоритет" value={SUPPORT_PRIORITY_LABELS[detail.effectivePriority]} /><Metric label="Обновлена" value={new Date(detail.updatedAt).toLocaleString("ru-RU")} /></section>
    <section><h2 className="text-lg font-semibold">Заявитель</h2><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><Metric label="Имя" value={detail.applicant.name} /><Metric label="Компания" value={detail.applicant.company} /><Metric label="Email" value={detail.applicant.email} /><Metric label="Телефон" value={detail.applicant.phone ?? "Не указан"} />{internal ? <><Metric label="Роль" value={detail.applicant.role} /><Metric label="IDNO" value={detail.applicant.fiscalCode ?? "Не указан"} /><Metric label="Статус партнёра" value={detail.applicant.partnerStatus} /><Metric label="Источник" value={detail.sourceRoute ?? "Не указан"} /></> : null}</dl></section>
    <section><h2 className="text-lg font-semibold">Описание</h2><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{detail.description}</p></section>
    {detail.resolutionSummary ? <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4"><h2 className="font-semibold">Предложенное решение</h2><p className="mt-2 whitespace-pre-wrap text-sm">{detail.resolutionSummary}</p></section> : null}
    <section><h2 className="text-lg font-semibold">Переписка</h2><ol className="mt-3 space-y-3">{detail.messages.map((message) => <li className={`rounded-md border p-3 text-sm ${message.visibility === "internal" ? "border-amber-200 bg-amber-50" : "border-zinc-200"}`} key={message.id}><p className="whitespace-pre-wrap">{message.body}</p><time className="mt-2 block text-xs text-zinc-500">{new Date(message.createdAt).toLocaleString("ru-RU")}</time></li>)}</ol></section>
    <section><h2 className="text-lg font-semibold">История</h2><ol className="mt-3 space-y-3">{detail.events.map((event) => <li className="border-l-2 border-emerald-200 pl-3" key={event.id}><p className="text-sm text-zinc-700">{event.message ?? event.type}</p><time className="text-xs text-zinc-500">{new Date(event.occurredAt).toLocaleString("ru-RU")}</time></li>)}</ol></section>
    {detail.attachments.length ? <section><h2 className="text-lg font-semibold">Материалы</h2><ul className="mt-3 space-y-2">{detail.attachments.map((file) => <li key={file.id}><Link className="text-sm font-medium text-emerald-700 underline" href={`/api/support/attachments/${file.id}`}>{file.fileName}</Link></li>)}</ul></section> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt><dd className="mt-1 text-sm font-medium text-zinc-900">{value}</dd></div>;
}
