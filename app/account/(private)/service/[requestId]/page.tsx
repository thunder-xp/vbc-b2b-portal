import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, MessageSquareText, Paperclip } from "lucide-react";
import { cancelCustomerServiceRequestAction } from "@/src/modules/final-customer/actions";
import { CustomerServiceReplyForm } from "@/src/modules/final-customer/components";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerDate, serviceStatusLabel, serviceTypeLabel } from "@/src/modules/final-customer/presentation";
import { customerServiceCancelAllowed, customerServiceReplyAllowed } from "@/src/modules/final-customer/service-lifecycle";

export default async function CustomerServiceRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const [{ requestId }, context, locale] = await Promise.all([params, getFinalCustomerContext(), getFinalCustomerLocale()]);
  const request = await createFinalCustomerService().serviceRequest(context.account, requestId);
  if (!request) notFound();
  const ro = locale === "ro";
  const cancellable = customerServiceCancelAllowed(request.status);
  const replyAllowed = customerServiceReplyAllowed(request.status);
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-8">
    <header><Link className="text-sm font-semibold text-emerald-700" href="/account/service">← {ro ? "Service" : "Сервис"}</Link><p className="mt-3 font-mono text-xs text-zinc-500">{request.number}</p><div className="mt-1 flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-semibold">{request.subject}</h1><span className={request.status === "NEED_INFO" ? "rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900" : "rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700"}>{serviceStatusLabel(request.status, locale)}</span></div><p className="mt-2 text-sm text-zinc-600">{serviceTypeLabel(request.type, locale)} · {customerDate(request.createdAt, locale)}</p></header>
    {request.status === "NEED_INFO" ? <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>{ro ? "Este necesar răspunsul dvs." : "Требуется ваш ответ."}</strong> {ro ? "Consultați mesajul Novotech și completați informațiile." : "Прочитайте сообщение Novotech и дополните информацию."}</section> : null}
    <section className="rounded-xl border border-zinc-200 bg-white p-5"><h2 className="text-sm font-semibold">{ro ? "Solicitarea inițială" : "Исходное обращение"}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{request.description}</p><p className="mt-4 text-xs text-zinc-500">{ro ? "Contact preferat" : "Предпочтительная связь"}: {request.preferredContact === "EMAIL" ? "Email" : (ro ? "Telefon" : "Телефон")}</p></section>
    <section className="space-y-3"><div className="flex items-center gap-2"><MessageSquareText aria-hidden className="size-5 text-emerald-700" /><h2 className="font-semibold">{ro ? "Conversație" : "Переписка"}</h2></div>{request.messages.length ? <ol className="space-y-3">{request.messages.map((message) => <li className={`max-w-[92%] rounded-xl border p-4 text-sm ${message.authorType === "CUSTOMER" ? "ml-auto border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`} key={message.id}><p className="text-xs font-semibold text-zinc-500">{message.authorType === "CUSTOMER" ? (ro ? "Dvs." : "Вы") : "Novotech"} · {customerDate(message.createdAt, locale)}</p><p className="mt-2 whitespace-pre-wrap leading-6">{message.body}</p></li>)}</ol> : <p className="text-sm text-zinc-500">{ro ? "Nu există încă mesaje." : "Сообщений пока нет."}</p>}</section>
    {request.attachments.length ? <section className="space-y-3"><div className="flex items-center gap-2"><Paperclip aria-hidden className="size-5 text-emerald-700" /><h2 className="font-semibold">{ro ? "Fișiere" : "Файлы"}</h2></div><ul className="grid gap-2 sm:grid-cols-2">{request.attachments.map((attachment) => <li key={attachment.id}><a className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium hover:border-emerald-300" href={`/api/customer-service/attachments/${attachment.id}`}><Download aria-hidden className="size-4" /><span className="truncate">{attachment.fileName}</span></a></li>)}</ul></section> : null}
    <section className="space-y-3"><h2 className="font-semibold">{ro ? "Istoric" : "История"}</h2><ol className="border-l border-zinc-200 pl-4">{request.timeline.map((event) => <li className="relative pb-4 text-sm" key={event.id}><span className="absolute -left-[21px] top-1 size-2 rounded-full bg-emerald-700" /><p>{timelineLabel(event.eventType, event.toStatus, locale)}</p><p className="mt-1 text-xs text-zinc-500">{customerDate(event.createdAt, locale)}</p></li>)}</ol></section>
    {replyAllowed ? <CustomerServiceReplyForm expectedVersion={request.version} locale={locale} requestId={request.id} /> : <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">{ro ? "Pentru ajutor suplimentar creați o solicitare nouă." : "Для дополнительной помощи создайте новое обращение."}</p>}
    <div className="flex flex-wrap gap-3">{request.orderId ? <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href={`/account/orders/${request.orderId}`}>{ro ? "Deschide comanda asociată" : "Открыть связанный заказ"}</Link> : null}{cancellable ? <form action={cancelCustomerServiceRequestAction}><input name="requestId" type="hidden" value={request.id} /><input name="expectedVersion" type="hidden" value={request.version} /><button className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700">{ro ? "Anulează solicitarea" : "Отменить обращение"}</button></form> : null}</div>
  </main>;
}

function timelineLabel(eventType: string, status: Parameters<typeof serviceStatusLabel>[0] | null, locale: "ru" | "ro") {
  const ro = locale === "ro";
  if (eventType === "CREATED" || eventType === "CUSTOMER_SERVICE_CREATED") return ro ? "Solicitare primită" : "Обращение получено";
  if (eventType === "CANCELLED") return ro ? "Solicitare anulată" : "Обращение отменено";
  if (eventType === "CUSTOMER_REPLIED" || eventType === "CUSTOMER_SERVICE_CUSTOMER_REPLIED") return ro ? "Ați răspuns" : "Вы ответили";
  if (eventType === "NOVOTECH_REPLIED" || eventType === "CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH") return ro ? "Novotech a răspuns" : "Novotech ответил";
  if (eventType === "ATTACHMENT_ADDED") return ro ? "Fișier adăugat" : "Добавлен файл";
  if (["STATUS_CHANGED", "CUSTOMER_SERVICE_STATUS_CHANGED", "CUSTOMER_SERVICE_NEED_INFO", "CUSTOMER_SERVICE_RESOLVED"].includes(eventType) && status) return `${ro ? "Statut" : "Статус"}: ${serviceStatusLabel(status, locale)}`;
  return ro ? "Solicitare actualizată" : "Обращение обновлено";
}
