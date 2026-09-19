import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerDate, customerMoney, orderStatus, orderStatusTone, paymentStatus, paymentStatusTone } from "@/src/modules/final-customer/presentation";
import { CustomerEmptyState, CustomerPager } from "@/src/modules/final-customer/components";
import { CabinetStatusBadge, WorkspaceHeader, cabinetList, cabinetPage, cabinetRow } from "@/src/modules/cabinet-experience/components";

export default async function FinalCustomerOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const page = positivePage((await searchParams).page); const pageSize = 20;
  const result = await createFinalCustomerService().listOrders(context.account, pageSize + 1, (page - 1) * pageSize);
  const orders = result.slice(0, pageSize); const ro = locale === "ro";
  return <main className={cabinetPage}>
    <WorkspaceHeader title={ro ? "Comenzile mele" : "Мои заказы"} description={ro ? "Starea, plata și conținutul comenzilor dvs." : "Статус, оплата и состав ваших заказов."} />
    {orders.length ? <ul className={cabinetList}>{orders.map((order) => <li key={order.id}><Link className={`grid min-h-24 grid-cols-[56px_minmax(0,1fr)] gap-3 p-4 sm:grid-cols-[56px_minmax(0,1fr)_220px_auto] sm:items-center sm:gap-5 ${cabinetRow}`} href={`/account/orders/${order.id}`}>
      <span className="relative size-14 overflow-hidden rounded-lg bg-zinc-100">{order.previewImageUrl ? <Image alt="" fill className="object-contain p-1" sizes="56px" src={order.previewImageUrl} /> : null}</span>
      <span className="min-w-0"><span className="flex items-baseline justify-between gap-3"><strong className="font-mono text-sm">{order.number}</strong><span className="text-xs text-zinc-500 sm:hidden">{customerDate(order.createdAt, locale)}</span></span><span className="mt-1 block truncate text-sm text-zinc-700">{order.itemSummary.length ? order.itemSummary.join(", ") : (ro ? `${order.itemCount} poziții` : `${order.itemCount} поз.`)}</span><span className="mt-1 block text-xs text-zinc-500">{customerDate(order.createdAt, locale)} · {order.itemCount} {ro ? "poz." : "поз."}</span></span>
      <span className="col-span-2 grid grid-cols-2 gap-3 sm:col-span-1"><span><span className="block text-xs text-zinc-500">{ro ? "Comandă" : "Заказ"}</span><span className="mt-1 block"><CabinetStatusBadge label={orderStatus(order.status, locale)} tone={orderStatusTone(order.status)} /></span></span><span><span className="block text-xs text-zinc-500">{ro ? "Plată" : "Оплата"}</span><span className="mt-1 block"><CabinetStatusBadge label={paymentStatus(order.paymentState, locale)} tone={paymentStatusTone(order.paymentState)} /></span></span></span>
      <span className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end"><strong className="tabular-nums">{customerMoney(order.total, order.currency, locale)}</strong><span className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-emerald-700">{ro ? "Detalii" : "Подробнее"}<ArrowRight aria-hidden className="size-4" /></span></span>
    </Link></li>)}</ul> : <CustomerEmptyState body={context.account.status === "ACTIVE" ? (ro ? "Comenzile confirmate vor apărea aici." : "Подтверждённые заказы появятся здесь.") : (ro ? "Istoricul va apărea după confirmarea identității." : "История появится после подтверждения личности.")} locale={locale} showService={false} title={ro ? "Nu aveți comenzi" : "Заказов пока нет"} />}
    <CustomerPager hasNext={result.length > pageSize} page={page} path="/account/orders" ro={ro} />
  </main>;
}
function positivePage(value?: string) { const page = Number(value); return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1; }
