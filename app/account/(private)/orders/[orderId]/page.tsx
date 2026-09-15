import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerDate, customerMoney, orderStatus } from "@/src/modules/final-customer/presentation";
import { getInstallationMarketplaceService } from "@/src/modules/installation-marketplace/server";

export default async function FinalCustomerOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const [{ orderId }, context, locale] = await Promise.all([params, getFinalCustomerContext(), getFinalCustomerLocale()]);
  const order = await createFinalCustomerService().orderDetail(context.account, orderId);
  if (!order) notFound();
  const installationEligible = await getInstallationMarketplaceService().isCustomerOrderEligible(order.id);
  const ro = locale === "ro";
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8"><header><Link className="text-sm font-semibold text-emerald-700" href="/account/orders">← {ro ? "Comenzi" : "Заказы"}</Link><div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-mono text-2xl font-semibold">{order.number}</h1><p className="mt-1 text-sm text-zinc-500">{customerDate(order.createdAt, locale)} · {orderStatus(order.status, locale)}</p></div><strong className="text-xl tabular-nums">{customerMoney(order.total, order.currency, locale)}</strong></div></header>
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white"><ul className="divide-y divide-zinc-200">{order.lines.map((line) => <li className="grid gap-3 p-4 sm:grid-cols-[56px_1fr_auto] sm:items-center" key={line.id}><div className="relative size-14 overflow-hidden rounded-lg bg-zinc-100">{line.imageUrl ? <Image alt="" fill className="object-contain p-1" sizes="56px" src={line.imageUrl} /> : null}</div><div><p className="font-semibold">{line.name}</p><p className="mt-1 text-xs text-zinc-500">SKU {line.sku} · {line.quantity} × {customerMoney(line.unitPrice, line.currency, locale)}</p></div><strong className="tabular-nums">{customerMoney(line.lineTotal, line.currency, locale)}</strong></li>)}</ul></section>
    <section className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-zinc-200 bg-white p-5"><h2 className="font-semibold">{ro ? "Plată" : "Оплата"}</h2><p className="mt-2 text-sm text-zinc-600">{order.paidAt ? `${ro ? "Confirmată" : "Подтверждена"}: ${customerDate(order.paidAt, locale)}` : orderStatus(order.status, locale)}</p></div><div className="rounded-xl border border-zinc-200 bg-white p-5"><h2 className="font-semibold">{ro ? "Livrare" : "Доставка"}</h2><p className="mt-2 text-sm text-zinc-600">{address(order.deliveryAddress) || (ro ? "Adresa este înregistrată în comandă." : "Адрес сохранён в заказе.")}</p></div></section>
    {installationEligible ? <Link className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white" href={`/account/installations/new?orderId=${order.id}`}>{ro ? "Alege instalatorul" : "Выбрать установщика"}</Link> : null}
  </main>;
}
function address(value: Readonly<Record<string, unknown>>) { return [value.locality, value.street, value.building, value.unit].filter(Boolean).join(", "); }
