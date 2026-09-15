import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PublicRetailAddToCartButton } from "@/src/modules/public-retail/components/PublicRetailAddToCartButton";
import { CustomerServiceRequestForm } from "@/src/modules/final-customer/components";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { buyAgainAllowed, customerDate } from "@/src/modules/final-customer/presentation";

export default async function EquipmentDetailPage({ params }: { params: Promise<{ lineId: string }> }) {
  const [{ lineId }, context, locale] = await Promise.all([params, getFinalCustomerContext(), getFinalCustomerLocale()]);
  const item = await createFinalCustomerService().equipmentDetail(context.account, lineId);
  if (!item) notFound();
  const ro = locale === "ro";
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8"><Link className="text-sm font-semibold text-emerald-700" href="/account/equipment">← {ro ? "Echipamente" : "Оборудование"}</Link><section className="grid gap-5 rounded-xl border border-zinc-200 bg-white p-5 sm:grid-cols-[140px_1fr]"><div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-100">{(item.currentProduct?.imageUrl ?? item.imageUrl) ? <Image alt="" fill className="object-contain p-3" sizes="140px" src={item.currentProduct?.imageUrl ?? item.imageUrl ?? ""} /> : null}</div><div><h1 className="text-2xl font-semibold">{item.name}</h1><p className="mt-1 text-sm text-zinc-500">SKU {item.sku}</p><p className="mt-3 text-sm">{ro ? "Cumpărat" : "Куплено"}: {customerDate(item.purchasedAt, locale)} · {item.orderNumber}</p><p className="mt-2 text-sm text-zinc-600">{ro ? "Garanția personală și seria nu sunt afișate fără date verificate." : "Персональная гарантия и серийный номер не отображаются без подтверждённых данных."}</p>{item.currentProduct && buyAgainAllowed(item.currentProduct.availability) ? <div className="mt-4 max-w-48"><PublicRetailAddToCartButton locale={locale} publicProductId={item.currentProduct.publicProductId} source="product_detail" /></div> : null}</div></section>
    <section className="rounded-xl border border-zinc-200 bg-white p-5"><h2 className="font-semibold">{ro ? "Documente despre produs" : "Документы по товару"}</h2>{item.documents.length ? <ul className="mt-3 grid gap-2">{item.documents.map((document) => <li key={document.id}><a className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href={document.url} rel="noreferrer" target="_blank">{document.title}</a></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">{ro ? "Nu există documente publicate." : "Опубликованных документов нет."}</p>}</section>
    <section><h2 className="mb-3 text-lg font-semibold">{ro ? "Solicitare privind produsul" : "Обращение по товару"}</h2><CustomerServiceRequestForm locale={locale} orderId={item.orderId} orderLineId={item.id} /></section>
  </main>;
}
