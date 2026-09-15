import Link from "next/link";
import { ArrowRight, Bell, Plus } from "lucide-react";
import { markCustomerServiceNotificationReadAction } from "@/src/modules/final-customer/actions";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerDate, serviceStatusLabel, serviceTypeLabel } from "@/src/modules/final-customer/presentation";
import { CustomerPager } from "@/src/modules/final-customer/components";

export default async function CustomerServicePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const page = positivePage((await searchParams).page); const pageSize = 20;
  const service = createFinalCustomerService();
  const [result, notifications] = await Promise.all([
    service.listServiceRequests(context.account, pageSize + 1, (page - 1) * pageSize),
    page === 1 ? service.listServiceNotifications(context.account) : Promise.resolve([]),
  ]);
  const requests = result.slice(0, pageSize); const hasNext = result.length > pageSize; const ro = locale === "ro";
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">{ro ? "Service" : "Сервис"}</h1><p className="mt-1 text-sm text-zinc-600">{ro ? "Solicitări despre instalare, diagnosticare, garanție, produse și comenzi." : "Обращения по монтажу, диагностике, гарантии, товарам и заказам."}</p></div><Link className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white" href="/account/service/new"><Plus aria-hidden className="size-4" />{ro ? "Solicitare nouă" : "Новое обращение"}</Link></header>
    {notifications.some((item) => !item.readAt) ? <section aria-label={ro ? "Notificări" : "Уведомления"} className="space-y-2"><div className="flex items-center gap-2"><Bell aria-hidden className="size-4 text-emerald-700" /><h2 className="text-sm font-semibold">{ro ? "Actualizări" : "Обновления"}</h2></div>{notifications.filter((item) => !item.readAt).map((item) => <form action={markCustomerServiceNotificationReadAction} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3" key={item.id}><input name="notificationId" type="hidden" value={item.id} /><Link className="min-w-0 flex-1 text-sm font-medium" href={item.actionPath}>{notificationLabel(item.eventCode, locale)}</Link><button className="min-h-11 rounded-lg px-3 text-xs font-semibold text-emerald-800">{ro ? "Citit" : "Прочитано"}</button></form>)}</section> : null}
    {requests.length ? <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">{requests.map((request) => <li className={request.status === "NEED_INFO" ? "bg-amber-50" : undefined} key={request.id}><Link className="grid min-h-20 gap-2 p-4 hover:bg-zinc-50 sm:grid-cols-[1fr_auto_auto] sm:items-center" href={`/account/service/${request.id}`}><div><p className="font-mono text-xs text-zinc-500">{request.number}</p><p className="font-semibold">{request.subject}</p><p className="mt-1 text-xs text-zinc-500">{serviceTypeLabel(request.type, locale)} · {customerDate(request.createdAt, locale)} · {ro ? "Actualizat" : "Обновлено"} {customerDate(request.updatedAt, locale)}</p></div><span className={request.status === "NEED_INFO" ? "rounded-full bg-amber-200 px-3 py-1 text-sm font-semibold text-amber-950" : "text-sm text-zinc-600"}>{serviceStatusLabel(request.status, locale)}</span><ArrowRight aria-hidden className="size-4" /></Link></li>)}</ul> : <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">{ro ? "Nu aveți solicitări." : "У вас пока нет обращений."}</p>}
    <CustomerPager hasNext={hasNext} page={page} path="/account/service" ro={ro} />
  </main>;
}

function positivePage(value?: string) { const page = Number(value); return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1; }
function notificationLabel(code: string, locale: "ru" | "ro") { const ro = locale === "ro"; if (code === "CUSTOMER_SERVICE_NEED_INFO") return ro ? "Sunt necesare informații suplimentare pentru solicitarea dvs." : "Нужна дополнительная информация по вашему обращению."; if (code === "CUSTOMER_SERVICE_RESOLVED") return ro ? "Solicitarea dvs. este marcată ca rezolvată." : "Ваше обращение отмечено как решённое."; return ro ? "Novotech a răspuns la solicitarea dvs." : "Novotech ответил на ваше обращение."; }
