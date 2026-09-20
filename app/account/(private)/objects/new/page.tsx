import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkspaceHeader, cabinetPageNarrow, cabinetTextAction } from "@/src/modules/cabinet-experience/components";
import { CustomerObjectForm } from "@/src/modules/final-customer/components";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";

export default async function NewCustomerObjectPage({ searchParams }: { searchParams: Promise<{ purchaseId?: string }> }) {
  const [context, locale, query] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale(), searchParams]);
  const purchase = query.purchaseId ? await createFinalCustomerService().orderDetail(context.account, query.purchaseId) : null;
  if (query.purchaseId && (!purchase || purchase.status !== "confirmed" || !purchase.paidAt)) notFound();
  const ro = locale === "ro";
  return <main className={cabinetPageNarrow}>
    <Link className={cabinetTextAction} href="/account/objects">← {ro ? "Obiectele mele" : "Мои объекты"}</Link>
    <WorkspaceHeader title={ro ? "Obiect nou" : "Новый объект"} description={purchase ? (ro ? `Comanda ${purchase.number} va fi legată după creare.` : `После создания будет привязан заказ ${purchase.number}.`) : (ro ? "Este suficientă o denumire ușor de recunoscut." : "Достаточно понятного вам названия.")} />
    <CustomerObjectForm locale={locale} retailOrderId={purchase?.id} />
  </main>;
}
