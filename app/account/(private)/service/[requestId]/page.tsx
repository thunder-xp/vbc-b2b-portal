import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelCustomerServiceRequestAction } from "@/src/modules/final-customer/actions";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerDate, serviceStatusLabel, serviceTypeLabel } from "@/src/modules/final-customer/presentation";

export default async function CustomerServiceRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const [{ requestId }, context, locale] = await Promise.all([params, getFinalCustomerContext(), getFinalCustomerLocale()]);
  const request = await createFinalCustomerService().serviceRequest(context.account, requestId); if (!request) notFound(); const ro = locale === "ro";
  const cancellable = ["NEW", "IN_REVIEW", "NEED_INFO"].includes(request.status);
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-8"><header><Link className="text-sm font-semibold text-emerald-700" href="/account/service">← {ro ? "Service" : "Сервис"}</Link><p className="mt-3 font-mono text-xs text-zinc-500">{request.number}</p><h1 className="mt-1 text-2xl font-semibold">{request.subject}</h1><p className="mt-2 text-sm text-zinc-600">{serviceTypeLabel(request.type, locale)} · {serviceStatusLabel(request.status, locale)} · {customerDate(request.createdAt, locale)}</p></header><section className="rounded-xl border border-zinc-200 bg-white p-5"><p className="whitespace-pre-wrap text-sm leading-6">{request.description}</p><p className="mt-4 text-xs text-zinc-500">{ro ? "Contact preferat" : "Предпочтительная связь"}: {request.preferredContact === "EMAIL" ? "Email" : (ro ? "Telefon" : "Телефон")}</p></section>{request.orderId ? <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href={`/account/orders/${request.orderId}`}>{ro ? "Deschide comanda asociată" : "Открыть связанный заказ"}</Link> : null}{cancellable ? <form action={cancelCustomerServiceRequestAction}><input name="requestId" type="hidden" value={request.id} /><input name="expectedVersion" type="hidden" value={request.version} /><button className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700">{ro ? "Anulează solicitarea" : "Отменить обращение"}</button></form> : null}</main>;
}
