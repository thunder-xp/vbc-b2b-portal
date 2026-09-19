import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerDate, customerMoney, orderStatus, paymentStatus } from "@/src/modules/final-customer/presentation";
import { CustomerEmptyState, CustomerPager } from "@/src/modules/final-customer/components";

export default async function FinalCustomerOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const page = positivePage((await searchParams).page); const pageSize = 20;
  const result = await createFinalCustomerService().listOrders(context.account, pageSize + 1, (page - 1) * pageSize);
  const orders = result.slice(0, pageSize); const hasNext = result.length > pageSize;
  const ro = locale === "ro";
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8"><header><h1 className="text-2xl font-semibold tracking-tight">{ro ? "Comenzile mele" : "Мои заказы"}</h1><p className="mt-1 text-sm text-zinc-600">{ro ? "Starea și conținutul comenzilor retail asociate contului." : "Статус и состав розничных заказов, связанных с аккаунтом."}</p></header>
    {orders.length ? <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">{orders.map((order) => <li key={order.id}><Link className="grid min-h-24 gap-3 p-4 hover:bg-zinc-50 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6" href={`/account/orders/${order.id}`}><div className="min-w-0"><p className="font-mono text-sm font-semibold">{order.number}</p><p className="mt-1 truncate text-sm text-zinc-700">{order.itemSummary.length ? order.itemSummary.join(", ") : (ro ? `${order.itemCount} poziții` : `${order.itemCount} позиций`)}</p><p className="mt-1 text-xs text-zinc-500">{customerDate(order.createdAt, locale)} · {order.itemCount} {ro ? "buc." : "поз."}</p></div><div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-1 sm:gap-1"><div><p className="text-xs text-zinc-500">{ro ? "Comandă" : "Заказ"}</p><p className="font-medium text-zinc-800">{orderStatus(order.status, locale)}</p></div><div><p className="text-xs text-zinc-500">{ro ? "Plată" : "Оплата"}</p><p className={order.paymentState === "REFUNDED" ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>{paymentStatus(order.paymentState, locale)}</p></div></div><div className="flex items-center justify-between gap-3 sm:justify-end"><strong className="tabular-nums">{customerMoney(order.total, order.currency, locale)}</strong><span className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-emerald-700">{ro ? "Detalii" : "Подробнее"}<ArrowRight aria-hidden className="size-4" /></span></div></Link></li>)}</ul>
    : <CustomerEmptyState body={context.account.status === "ACTIVE" ? (ro ? "Comenzile asociate în mod verificat vor apărea aici. Puteți continua cumpărăturile sau contacta service-ul." : "Подтверждённо связанные заказы появятся здесь. Можно продолжить покупки или обратиться в сервис.") : (ro ? "Istoricul este în curs de verificare și nu este afișat până la confirmarea legăturii." : "История проходит проверку и не отображается до подтверждения связи.")} locale={locale} title={ro ? "Nu există comenzi disponibile" : "Доступных заказов пока нет"} />}<CustomerPager hasNext={hasNext} page={page} path="/account/orders" ro={ro} />
  </main>;
}
function positivePage(value?: string) { const page = Number(value); return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1; }
