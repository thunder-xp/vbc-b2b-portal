import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerDate, customerMoney, orderStatus } from "@/src/modules/final-customer/presentation";
import { CustomerPager } from "@/src/modules/final-customer/components";

export default async function FinalCustomerOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const page = positivePage((await searchParams).page); const pageSize = 20;
  const result = await createFinalCustomerService().listOrders(context.account, pageSize + 1, (page - 1) * pageSize);
  const orders = result.slice(0, pageSize); const hasNext = result.length > pageSize;
  const ro = locale === "ro";
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8"><header><h1 className="text-2xl font-semibold tracking-tight">{ro ? "Comenzile mele" : "Мои заказы"}</h1><p className="mt-1 text-sm text-zinc-600">{ro ? "Starea și conținutul comenzilor retail asociate contului." : "Статус и состав розничных заказов, связанных с аккаунтом."}</p></header>
    {orders.length ? <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">{orders.map((order) => <li key={order.id}><Link className="grid min-h-20 gap-2 p-4 hover:bg-zinc-50 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-5" href={`/account/orders/${order.id}`}><div><p className="font-mono text-sm font-semibold">{order.number}</p><p className="mt-1 text-xs text-zinc-500">{customerDate(order.createdAt, locale)} · {order.itemCount} {ro ? "buc." : "поз."}</p></div><span className="text-sm text-zinc-600">{orderStatus(order.status, locale)}</span><strong className="tabular-nums">{customerMoney(order.total, order.currency, locale)}</strong><ArrowRight aria-hidden className="size-4" /></Link></li>)}</ul>
    : <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">{context.account.status === "ACTIVE" ? (ro ? "Nu există comenzi asociate." : "Связанных заказов пока нет.") : (ro ? "Istoricul este în curs de verificare." : "История проходит проверку.")}</p>}<CustomerPager hasNext={hasNext} page={page} path="/account/orders" ro={ro} />
  </main>;
}
function positivePage(value?: string) { const page = Number(value); return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1; }
