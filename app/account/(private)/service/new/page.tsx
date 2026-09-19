import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerServiceRequestForm } from "@/src/modules/final-customer/components";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";

export default async function NewCustomerServiceRequestPage({ searchParams }: { searchParams: Promise<{ orderId?: string; orderLineId?: string }> }) {
  const [locale, context, query] = await Promise.all([getFinalCustomerLocale(), getFinalCustomerContext(), searchParams]);
  const order = query.orderId ? await createFinalCustomerService().orderDetail(context.account, query.orderId) : null;
  if (query.orderId && !order) notFound();
  const ro = locale === "ro";
  const orderLineId = order?.lines.some((line) => line.id === query.orderLineId) ? query.orderLineId : undefined;
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-8"><header><Link className="text-sm font-semibold text-emerald-700" href="/account/service">← {ro ? "Service" : "Сервис"}</Link><h1 className="mt-3 text-2xl font-semibold">{ro ? "Solicitare nouă" : "Новое обращение"}</h1><p className="mt-1 text-sm text-zinc-600">{ro ? "Descrieți pe scurt situația. Actualizările vor apărea aici, în contul personal." : "Кратко опишите ситуацию. Обновления появятся здесь, в личном кабинете."}</p>{order ? <p className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm">{ro ? "Comandă asociată" : "Связанный заказ"}: <strong className="font-mono">{order.number}</strong></p> : null}</header><CustomerServiceRequestForm locale={locale} orderId={order?.id} orderLineId={orderLineId} /></main>;
}
