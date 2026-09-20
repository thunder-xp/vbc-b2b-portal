import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerServiceRequestForm } from "@/src/modules/final-customer/components";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { WorkspaceHeader, cabinetPageNarrow, cabinetTextAction } from "@/src/modules/cabinet-experience/components";

export default async function NewCustomerServiceRequestPage({ searchParams }: { searchParams: Promise<{ objectId?: string; orderId?: string; orderLineId?: string }> }) {
  const [locale, context, query] = await Promise.all([getFinalCustomerLocale(), getFinalCustomerContext(), searchParams]);
  const service = createFinalCustomerService();
  const [order, object] = await Promise.all([
    query.orderId ? service.orderDetail(context.account, query.orderId) : Promise.resolve(null),
    query.objectId ? service.customerObject(context.account, query.objectId) : Promise.resolve(null),
  ]);
  if (query.orderId && !order) notFound();
  if (query.objectId && (!object || object.status !== "ACTIVE")) notFound();
  const ro = locale === "ro";
  const orderLineId = order?.lines.some((line) => line.id === query.orderLineId) ? query.orderLineId : undefined;
  return <main className={cabinetPageNarrow}><Link className={cabinetTextAction} href={object ? `/account/objects/${object.id}` : "/account/service"}>← {object ? object.name : (ro ? "Service" : "Сервис")}</Link><WorkspaceHeader title={ro ? "Solicitare nouă" : "Новое обращение"} description={ro ? "Descrieți pe scurt situația. Actualizările vor apărea aici, în contul personal." : "Кратко опишите ситуацию. Обновления появятся здесь, в личном кабинете."} />{object ? <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm">{ro ? "Obiect" : "Объект"}: <strong>{object.name}</strong></p> : null}{order ? <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm">{ro ? "Comandă asociată" : "Связанный заказ"}: <strong className="font-mono">{order.number}</strong></p> : null}<CustomerServiceRequestForm customerObjectId={object?.id} locale={locale} orderId={order?.id} orderLineId={orderLineId} /></main>;
}
