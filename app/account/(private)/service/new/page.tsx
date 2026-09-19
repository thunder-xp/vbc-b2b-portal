import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerServiceRequestForm } from "@/src/modules/final-customer/components";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { WorkspaceHeader, cabinetPageNarrow, cabinetTextAction } from "@/src/modules/cabinet-experience/components";

export default async function NewCustomerServiceRequestPage({ searchParams }: { searchParams: Promise<{ orderId?: string; orderLineId?: string }> }) {
  const [locale, context, query] = await Promise.all([getFinalCustomerLocale(), getFinalCustomerContext(), searchParams]);
  const order = query.orderId ? await createFinalCustomerService().orderDetail(context.account, query.orderId) : null;
  if (query.orderId && !order) notFound();
  const ro = locale === "ro";
  const orderLineId = order?.lines.some((line) => line.id === query.orderLineId) ? query.orderLineId : undefined;
  return <main className={cabinetPageNarrow}><Link className={cabinetTextAction} href="/account/service">← {ro ? "Service" : "Сервис"}</Link><WorkspaceHeader title={ro ? "Solicitare nouă" : "Новое обращение"} description={ro ? "Descrieți pe scurt situația. Actualizările vor apărea aici, în contul personal." : "Кратко опишите ситуацию. Обновления появятся здесь, в личном кабинете."} />{order ? <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm">{ro ? "Comandă asociată" : "Связанный заказ"}: <strong className="font-mono">{order.number}</strong></p> : null}<CustomerServiceRequestForm locale={locale} orderId={order?.id} orderLineId={orderLineId} /></main>;
}
