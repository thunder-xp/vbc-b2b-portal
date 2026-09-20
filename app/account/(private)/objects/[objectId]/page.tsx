import { Archive, FileText, Headphones, Pencil, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductThumbnail } from "@/src/modules/catalog/components";
import { CabinetStatusBadge, SectionHeader, cabinetList, cabinetPage, cabinetSecondaryAction, cabinetSurface, cabinetTextAction } from "@/src/modules/cabinet-experience/components";
import { archiveCustomerObjectAction } from "@/src/modules/final-customer/actions";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerObjectStatusLabel, customerObjectTypeLabels } from "@/src/modules/final-customer/object-copy";
import { customerDate, customerMoney, serviceStatusLabel, serviceStatusTone } from "@/src/modules/final-customer/presentation";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";

export default async function CustomerObjectDetailPage({ params }: { params: Promise<{ objectId: string }> }) {
  const [{ objectId }, context, locale] = await Promise.all([params, getFinalCustomerContext(), getFinalCustomerLocale()]);
  const detail = await createFinalCustomerService().customerObjectDetail(context.account, objectId);
  if (!detail) notFound();
  const ro = locale === "ro";
  const object = detail.object;
  const productCount = detail.purchases.reduce((sum, purchase) => sum + purchase.lines.length, 0);
  return <main className={cabinetPage}>
    <header className="space-y-3">
      <Link className={cabinetTextAction} href="/account/objects">← {ro ? "Obiectele mele" : "Мои объекты"}</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{ro ? "Pașaport digital de securitate" : "Цифровой паспорт безопасности"}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{object.name}</h1><p className="mt-1 text-sm text-zinc-500">{customerObjectTypeLabels[locale][object.objectType]}{object.locality ? ` · ${object.locality}` : ""}{object.addressLabel ? ` · ${object.addressLabel}` : ""}</p></div><div className="flex flex-wrap gap-2">{object.status === "ACTIVE" ? <><Link className={cabinetSecondaryAction} href={`/account/objects/${object.id}/edit`}><Pencil aria-hidden className="size-4" />{ro ? "Editează" : "Изменить"}</Link><Link className={cabinetSecondaryAction} href={`/account/service/new?objectId=${object.id}`}><Headphones aria-hidden className="size-4" />{ro ? "Solicită service" : "Обратиться в сервис"}</Link></> : <CabinetStatusBadge label={customerObjectStatusLabel(object.status, locale)} tone="neutral" />}</div></div>
    </header>

    {detail.purchases.length ? <section className="space-y-3"><SectionHeader title={ro ? "Cumpărături și produse" : "Покупки и товары"} /><div className="space-y-4">{detail.purchases.map((purchase) => <article className={cabinetSurface} key={purchase.id}>
      <div className="flex flex-col gap-2 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><Link className="inline-flex min-h-11 items-center font-mono text-sm font-semibold text-emerald-700" href={`/account/orders/${purchase.id}`}>{purchase.number}</Link><p className="text-xs text-zinc-500">{customerDate(purchase.purchasedAt, locale)} · {ro ? "Achiziționat" : "Приобретено"}</p></div><strong className="tabular-nums">{customerMoney(purchase.total, purchase.currency, locale)}</strong></div>
      <ul className="divide-y divide-zinc-200">{purchase.lines.map((line) => <li className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 p-4 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:items-center" key={line.id}><div className="relative size-14 overflow-hidden rounded-lg bg-zinc-100"><ProductThumbnail alt={line.name} sizes="56px" src={line.currentProduct?.imageUrl ?? line.imageUrl} variant="xs" /></div><div className="min-w-0">{line.currentProduct ? <Link className="inline-flex min-h-11 items-center font-semibold hover:text-emerald-700" href={`/products/${line.currentProduct.slug}?lang=${locale}`}>{line.name}</Link> : <p className="font-semibold">{line.name}</p>}<p className="font-mono text-xs text-zinc-500">SKU {line.sku} · {ro ? "Achiziționat" : "Приобретено"}: {line.quantity}</p>{line.documents.length ? <div className="mt-2 flex flex-wrap gap-2">{line.documents.map((document) => <a className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-emerald-700" href={document.url} key={document.id} rel="noreferrer" target="_blank"><FileText aria-hidden className="size-3.5" />{document.title}</a>)}</div> : null}</div><strong className="col-start-2 tabular-nums sm:col-auto">{customerMoney(line.lineTotal, line.currency, locale)}</strong></li>)}</ul>
    </article>)}</div></section> : <section className={`p-4 sm:p-5 ${cabinetSurface}`}><h2 className="font-semibold">{ro ? "Nu există cumpărături legate" : "Нет привязанных покупок"}</h2><p className="mt-1 text-sm text-zinc-600">{ro ? "Puteți lega o cumpărătură confirmată din secțiunea Cumpărături." : "Подтверждённую покупку можно привязать в разделе «Покупки»."}</p><Link className={`${cabinetTextAction} mt-2`} href="/account/purchases"><ShoppingBag aria-hidden className="size-4" />{ro ? "Cumpărături" : "Покупки"}</Link></section>}

    {detail.serviceRequests.length ? <section className="space-y-3"><SectionHeader title={ro ? "Service" : "Сервис"} /><ul className={cabinetList}>{detail.serviceRequests.map((request) => <li key={request.id}><Link className="flex min-h-16 items-center justify-between gap-3 px-4 py-3" href={`/account/service/${request.id}`}><span className="min-w-0"><strong className="block truncate">{request.subject}</strong><span className="mt-1 block font-mono text-xs text-zinc-500">{request.number}</span></span><CabinetStatusBadge label={serviceStatusLabel(request.status, locale)} tone={serviceStatusTone(request.status)} /></Link></li>)}</ul></section> : null}

    <section className="border-t border-zinc-200 pt-4" aria-label={ro ? "Rezumat" : "Сводка"}><p className="text-sm text-zinc-600">{customerObjectSummary(detail.purchases.length, productCount, locale)}</p><p className="mt-1 text-xs text-zinc-500">{ro ? "Produsele sunt marcate ca achiziționate, nu ca instalate. Garanția și seriile apar numai din surse confirmate." : "Товары отмечены как приобретённые, а не установленные. Гарантия и серийные номера появятся только из подтверждённых источников."}</p></section>

    {object.status === "ACTIVE" ? <form action={archiveCustomerObjectAction} className="border-t border-zinc-200 pt-4"><input name="objectId" type="hidden" value={object.id} /><input name="expectedVersion" type="hidden" value={object.version} /><button className={cabinetSecondaryAction} type="submit"><Archive aria-hidden className="size-4" />{ro ? "Arhivează obiectul" : "Архивировать объект"}</button><p className="mt-2 text-xs text-zinc-500">{ro ? "Istoricul, cumpărăturile și solicitările de service se păstrează." : "История, покупки и обращения сохранятся."}</p></form> : null}
  </main>;
}

function customerObjectSummary(purchaseCount: number, productCount: number, locale: "ru" | "ro") {
  if (locale === "ro") {
    const purchases = purchaseCount === 1 ? "cumpărătură" : "cumpărături";
    const products = productCount === 1 ? "poziție" : "poziții";
    return `${purchaseCount} ${purchases} · ${productCount} ${products}`;
  }
  const purchases = purchaseCount % 10 === 1 && purchaseCount % 100 !== 11
    ? "покупка"
    : purchaseCount % 10 >= 2 && purchaseCount % 10 <= 4 && (purchaseCount % 100 < 12 || purchaseCount % 100 > 14)
      ? "покупки"
      : "покупок";
  const products = productCount % 10 === 1 && productCount % 100 !== 11
    ? "позиция"
    : productCount % 10 >= 2 && productCount % 10 <= 4 && (productCount % 100 < 12 || productCount % 100 > 14)
      ? "позиции"
      : "позиций";
  return `${purchaseCount} ${purchases} · ${productCount} ${products}`;
}
