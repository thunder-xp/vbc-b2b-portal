import Link from "next/link";
import { ArrowRight, Bell, LifeBuoy, Plus } from "lucide-react";
import { markCustomerServiceNotificationReadAction } from "@/src/modules/final-customer/actions";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerDate, serviceStatusLabel, serviceStatusTone, serviceTypeLabel } from "@/src/modules/final-customer/presentation";
import { CustomerPager } from "@/src/modules/final-customer/components";
import { CabinetEmptyState, CabinetStatusBadge, WorkspaceHeader, cabinetList, cabinetPage, cabinetPrimaryAction, cabinetRow } from "@/src/modules/cabinet-experience/components";

export default async function CustomerServicePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const page = positivePage((await searchParams).page); const pageSize = 20; const service = createFinalCustomerService();
  const [result, notifications] = await Promise.all([service.listServiceRequests(context.account, pageSize + 1, (page - 1) * pageSize), page === 1 ? service.listServiceNotifications(context.account) : Promise.resolve([])]);
  const requests = result.slice(0, pageSize); const ro = locale === "ro";
  return <main className={cabinetPage}>
    <WorkspaceHeader title={ro ? "Service" : "Сервис"} description={ro ? "Conversațiile dvs. cu echipa Novotech." : "Ваши обращения и переписка с Novotech."} actions={<Link className={cabinetPrimaryAction} href="/account/service/new"><Plus aria-hidden className="size-4" />{ro ? "Solicitare nouă" : "Новое обращение"}</Link>} />
    {notifications.length ? <section aria-label={ro ? "Notificări" : "Уведомления"} className="space-y-2"><div className="flex items-center gap-2"><Bell aria-hidden className="size-4 text-emerald-700" /><h2 className="text-sm font-semibold">{ro ? "Actualizări" : "Обновления"}</h2></div>{notifications.slice(0, 5).map((item) => {
      const actionRequired = item.eventCode === "CUSTOMER_SERVICE_NEED_INFO" && requests.some((request) => request.id === item.requestId && request.status === "NEED_INFO");
      return <div className={`flex min-h-14 items-center gap-2 rounded-lg border px-3 py-2 ${actionRequired ? "border-amber-200 bg-amber-50" : item.readAt ? "border-zinc-200 bg-white" : "border-emerald-200 bg-emerald-50"}`} key={item.id}><Link className="flex min-h-11 min-w-0 flex-1 items-center rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-emerald-700" href={item.actionPath}>{notificationLabel(item.eventCode, locale)}</Link><span className="hidden text-xs font-semibold text-zinc-500 sm:inline">{actionRequired ? (ro ? "Acțiune necesară" : "Нужно действие") : item.readAt ? (ro ? "Văzut" : "Просмотрено") : (ro ? "Nou" : "Новое")}</span>{!item.readAt ? <form action={markCustomerServiceNotificationReadAction}><input name="notificationId" type="hidden" value={item.id} /><button className="min-h-11 rounded-lg px-3 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-emerald-700 motion-reduce:transition-none" type="submit">{ro ? "Marchează citit" : "Прочитано"}</button></form> : null}</div>;
    })}</section> : null}
    {requests.length ? <ul className={cabinetList}>{requests.map((request) => {
      const needsInfo = request.status === "NEED_INFO"; const quiet = ["RESOLVED", "CLOSED", "CANCELLED"].includes(request.status);
      return <li className={needsInfo ? "bg-amber-50/60" : quiet ? "bg-zinc-50/70" : undefined} key={request.id}><Link className={`grid min-h-24 gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_190px_auto] sm:items-center ${cabinetRow}`} href={`/account/service/${request.id}`}>
        <span className="min-w-0"><span className="font-mono text-xs text-zinc-500">{request.number}</span><strong className="mt-0.5 block">{request.subject}</strong><span className="mt-1 block truncate text-sm text-zinc-600">{request.latestMessage ? `${request.latestMessageAuthor === "CUSTOMER" ? (ro ? "Dvs." : "Вы") : "Novotech"}: ${request.latestMessage}` : request.description}</span><span className="mt-1 block text-xs text-zinc-500">{serviceTypeLabel(request.type, locale)} · {customerDate(request.latestMessageAt ?? request.updatedAt, locale)}</span></span>
        <CabinetStatusBadge label={serviceStatusLabel(request.status, locale)} tone={serviceStatusTone(request.status)} /><ArrowRight aria-hidden className="size-4 text-zinc-400" />
      </Link></li>;
    })}</ul> : <CabinetEmptyState Icon={LifeBuoy} actions={<Link className={cabinetPrimaryAction} href="/account/service/new">{ro ? "Creați solicitare" : "Создать обращение"}</Link>} body={ro ? "Creați o solicitare dacă aveți o întrebare despre produs, comandă sau garanție." : "Создайте обращение, если есть вопрос о товаре, заказе или гарантии."} title={ro ? "Nu aveți solicitări" : "Обращений пока нет"} />}
    <CustomerPager hasNext={result.length > pageSize} page={page} path="/account/service" ro={ro} />
  </main>;
}
function positivePage(value?: string) { const page = Number(value); return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1; }
function notificationLabel(code: string, locale: "ru" | "ro") { const ro = locale === "ro"; if (code === "CUSTOMER_SERVICE_NEED_INFO") return ro ? "Sunt necesare informații suplimentare." : "Нужна дополнительная информация."; if (code === "CUSTOMER_SERVICE_RESOLVED") return ro ? "Solicitarea este rezolvată." : "Обращение решено."; return ro ? "Novotech a răspuns." : "Novotech ответил."; }
