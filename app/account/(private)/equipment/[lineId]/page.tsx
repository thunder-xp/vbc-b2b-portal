import Image from "next/image";
import Link from "next/link";
import { FileText, Headphones, PackageOpen } from "lucide-react";
import { notFound } from "next/navigation";

import { PublicRetailAddToCartButton } from "@/src/modules/public-retail/components/PublicRetailAddToCartButton";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { buyAgainAllowed, customerDate, customerMoney } from "@/src/modules/final-customer/presentation";
import { WorkspaceHeader, cabinetPage, cabinetSecondaryAction, cabinetSurface, cabinetTextAction } from "@/src/modules/cabinet-experience/components";

export default async function EquipmentDetailPage({ params }: { params: Promise<{ lineId: string }> }) {
  const [{ lineId }, context, locale] = await Promise.all([params, getFinalCustomerContext(), getFinalCustomerLocale()]);
  const item = await createFinalCustomerService().equipmentDetail(context.account, lineId);
  if (!item) notFound();
  const ro = locale === "ro";
  const available = Boolean(item.currentProduct && buyAgainAllowed(item.currentProduct.availability));

  return <main className={cabinetPage}>
    <div><Link className={cabinetTextAction} href="/account/purchases">← {ro ? "Cumpărături" : "Покупки"}</Link><WorkspaceHeader title={ro ? "Detaliile cumpărăturii" : "Детали покупки"} /></div>
    <section className={`grid gap-5 p-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:p-5 ${cabinetSurface}`}>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-100">
        {(item.currentProduct?.imageUrl ?? item.imageUrl) ? <Image alt="" fill className="object-contain p-3" sizes="140px" src={item.currentProduct?.imageUrl ?? item.imageUrl ?? ""} /> : <PackageOpen aria-hidden className="absolute inset-0 m-auto size-8 text-zinc-400" />}
      </div>
      <div className="min-w-0">
        <h2 className="text-xl font-semibold">{item.name}</h2>
        <p className="mt-1 text-sm text-zinc-500">SKU {item.sku}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-zinc-500">{ro ? "Cumpărat" : "Куплено"}</dt><dd className="mt-0.5 font-medium">{customerDate(item.purchasedAt, locale)}</dd></div>
          <div><dt className="text-xs text-zinc-500">{ro ? "Cantitate" : "Количество"}</dt><dd className="mt-0.5 font-medium">{item.quantity}</dd></div>
          <div><dt className="text-xs text-zinc-500">{ro ? "Comandă" : "Заказ"}</dt><dd><Link className="inline-flex min-h-11 items-center font-mono font-semibold text-emerald-700" href={`/account/orders/${item.orderId}`}>{item.orderNumber}</Link></dd></div>
          {item.currentProduct ? <div><dt className="text-xs text-zinc-500">{ro ? "Preț actual" : "Текущая цена"}</dt><dd className="mt-0.5 font-medium">{customerMoney(item.currentProduct.price, item.currentProduct.currency, locale)}</dd></div> : null}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {item.currentProduct ? <Link className={cabinetSecondaryAction} href={`/products/${item.currentProduct.slug}?lang=${locale}`}>{ro ? "Deschide produsul" : "Открыть товар"}</Link> : null}
          <Link className={cabinetSecondaryAction} href={`/account/service/new?orderId=${item.orderId}&orderLineId=${item.id}`}><Headphones aria-hidden className="size-4" />{ro ? "Service" : "Обратиться в сервис"}</Link>
        </div>
        <div className="mt-2 max-w-56">{available && item.currentProduct ? <PublicRetailAddToCartButton locale={locale} publicProductId={item.currentProduct.publicProductId} source="product_detail" /> : <p className="rounded-lg bg-zinc-100 px-3 py-3 text-sm text-zinc-600">{ro ? "Produsul nu este disponibil momentan." : "Товар сейчас недоступен."}</p>}</div>
      </div>
    </section>
    <section className={`p-4 sm:p-5 ${cabinetSurface}`}>
      <h2 className="font-semibold">{ro ? "Garanție și documente" : "Гарантия и документы"}</h2>
      <p className="mt-2 text-sm text-zinc-600">{ro ? "Afișăm numai condițiile generale publicate pentru produs. Perioada personală de garanție și seria nu sunt calculate fără date verificate." : "Показываются только опубликованные общие условия по товару. Персональный срок гарантии и серийный номер не рассчитываются без подтверждённых данных."}</p>
      {item.documents.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{item.documents.map((document) => <li key={document.id}><a className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-emerald-700" href={document.url} rel="noreferrer" target="_blank"><FileText aria-hidden className="size-4" />{document.title}</a></li>)}</ul> : <p className="mt-3 text-sm text-zinc-500">{ro ? "Nu există documente publicate pentru acest produs." : "По этому товару нет опубликованных документов."}</p>}
    </section>
  </main>;
}
