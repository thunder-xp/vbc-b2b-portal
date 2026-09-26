import Image from "next/image";
import Link from "next/link";
import { Building2, CalendarClock, FileText, Headphones, PackageOpen, Wrench } from "lucide-react";
import { notFound } from "next/navigation";

import { PublicRetailAddToCartButton } from "@/src/modules/public-retail/components/PublicRetailAddToCartButton";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { buyAgainAllowed, customerDate, serviceStatusLabel } from "@/src/modules/final-customer/presentation";
import { WorkspaceHeader, cabinetList, cabinetPage, cabinetSecondaryAction, cabinetSurface, cabinetTextAction } from "@/src/modules/cabinet-experience/components";

export default async function EquipmentDetailPage({ params }: { params: Promise<{ lineId: string }> }) {
  const [{ lineId }, context, locale] = await Promise.all([params, getFinalCustomerContext(), getFinalCustomerLocale()]);
  const item = await createFinalCustomerService().equipmentDetail(context.account, lineId);
  if (!item) notFound();
  const ro = locale === "ro";
  const available = Boolean(item.currentProduct && buyAgainAllowed(item.currentProduct.availability));
  const serviceHref = `/account/service/new?${new URLSearchParams({ ...(item.object ? { objectId: item.object.id } : {}), orderId: item.orderId, orderLineId: item.id })}`;

  return <main className={cabinetPage}>
    <div><Link className={cabinetTextAction} href={item.object ? `/account/objects/${item.object.id}` : "/account/purchases"}>← {item.object?.name ?? (ro ? "Cumpărături" : "Покупки")}</Link><WorkspaceHeader title={ro ? "Pașaportul echipamentului" : "Паспорт оборудования"} description={ro ? "Date confirmate despre achiziție, obiect, instalare și service." : "Подтверждённые данные о покупке, объекте, установке и сервисе."} /></div>

    <section className={`grid gap-5 p-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:p-5 ${cabinetSurface}`}>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-100">{(item.currentProduct?.imageUrl ?? item.imageUrl) ? <Image alt="" fill className="object-contain p-3" sizes="140px" src={item.currentProduct?.imageUrl ?? item.imageUrl ?? ""} /> : <PackageOpen aria-hidden className="absolute inset-0 m-auto size-8 text-zinc-400" />}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{ro ? "Achiziție confirmată" : "Подтверждённая покупка"}</p>
        <h1 className="mt-1 text-xl font-semibold">{item.name}</h1><p className="mt-1 font-mono text-sm text-zinc-500">SKU {item.sku}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-zinc-500">{ro ? "Cumpărat" : "Куплено"}</dt><dd className="mt-0.5 font-medium">{customerDate(item.purchasedAt, locale)}</dd></div>
          <div><dt className="text-xs text-zinc-500">{ro ? "Cantitate în poziție" : "Количество в позиции"}</dt><dd className="mt-0.5 font-medium">{item.quantity}</dd></div>
          <div><dt className="text-xs text-zinc-500">{ro ? "Comandă" : "Заказ"}</dt><dd><Link className="inline-flex min-h-11 items-center font-mono font-semibold text-emerald-700" href={`/account/orders/${item.orderId}`}>{item.orderNumber}</Link></dd></div>
          <div><dt className="text-xs text-zinc-500">{ro ? "Obiect" : "Объект"}</dt><dd className="mt-0.5 font-medium">{item.object ? <Link className="text-emerald-700" href={`/account/objects/${item.object.id}`}>{item.object.name}</Link> : (ro ? "Neatribuit unui obiect" : "Не привязано к объекту")}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">{item.currentProduct ? <Link className={cabinetSecondaryAction} href={`/products/${item.currentProduct.slug}?lang=${locale}`}>{ro ? "Produs" : "Товар"}</Link> : null}<Link className={cabinetSecondaryAction} href={serviceHref}><Headphones aria-hidden className="size-4" />{ro ? "Solicită service" : "Обратиться в сервис"}</Link></div>
        <div className="mt-2 max-w-56">{available && item.currentProduct ? <PublicRetailAddToCartButton locale={locale} publicProductId={item.currentProduct.publicProductId} source="product_detail" /> : null}</div>
      </div>
    </section>

    <section className={`p-4 sm:p-5 ${cabinetSurface}`}><h2 className="flex items-center gap-2 font-semibold"><Wrench aria-hidden className="size-4" />{ro ? "Instalare" : "Установка"}</h2>{item.installation ? <div className="mt-2 text-sm text-zinc-600"><p>{installationLabel(item.installation.evidence, ro)}</p><Link className={`${cabinetTextAction} mt-2`} href={`/account/installations/${item.installation.projectId}`}>{ro ? "Deschide proiectul de instalare" : "Открыть проект установки"}</Link></div> : <p className="mt-2 text-sm text-zinc-600">{ro ? "Nu există date confirmate despre instalare. Achiziția nu înseamnă automat că echipamentul a fost instalat." : "Подтверждённых данных об установке нет. Покупка не означает, что оборудование установлено."}</p>}</section>

    <section className={`p-4 sm:p-5 ${cabinetSurface}`}><h2 className="font-semibold">{ro ? "Garanție și documente" : "Гарантия и документы"}</h2><p className="mt-2 text-sm text-zinc-600">{ro ? "Datele despre garanția personală și numărul de serie se clarifică. Nu calculăm perioada fără date verificate." : "Данные о персональной гарантии и серийном номере уточняются. Мы не рассчитываем срок без проверенных данных."}</p>{item.documents.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{item.documents.map((document) => <li key={document.id}><a className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-emerald-700" href={document.url} rel="noreferrer" target="_blank"><FileText aria-hidden className="size-4" />{document.title}</a></li>)}</ul> : null}</section>

    {item.serviceHistory.length ? <section className="space-y-3"><h2 className="flex items-center gap-2 font-semibold"><CalendarClock aria-hidden className="size-4" />{ro ? "Istoric service" : "История сервиса"}</h2><ul className={cabinetList}>{item.serviceHistory.map((request) => <li key={request.id}><Link className="flex min-h-14 items-center justify-between gap-3 px-4 py-3" href={`/account/service/${request.id}`}><span className="min-w-0"><strong className="block truncate">{request.subject}</strong><span className="text-xs text-zinc-500">{request.number} · {customerDate(request.updatedAt, locale)}</span></span><span className="shrink-0 text-xs font-semibold text-zinc-600">{serviceStatusLabel(request.status, locale)}</span></Link></li>)}</ul></section> : null}

    {!item.object ? <section className={`flex items-start gap-3 p-4 sm:p-5 ${cabinetSurface}`}><Building2 aria-hidden className="mt-0.5 size-5 shrink-0 text-zinc-500" /><div><h2 className="font-semibold">{ro ? "Echipament neatribuit" : "Оборудование без объекта"}</h2><p className="mt-1 text-sm text-zinc-600">{ro ? "Asociați comanda cu un obiect din lista de cumpărături pentru a grupa echipamentul pe locație." : "Привяжите заказ к объекту из списка покупок, чтобы сгруппировать оборудование по месту эксплуатации."}</p><Link className={`${cabinetTextAction} mt-2`} href="/account/purchases">{ro ? "Deschide cumpărăturile" : "Открыть покупки"}</Link></div></section> : null}
  </main>;
}

function installationLabel(evidence: "CONFIRMED_INSTALLED" | "PARTNER_REPORTED" | "IN_PROGRESS" | "INACTIVE", ro: boolean) {
  if (evidence === "CONFIRMED_INSTALLED") return ro ? "Instalarea a fost confirmată de client." : "Установка подтверждена клиентом.";
  if (evidence === "PARTNER_REPORTED") return ro ? "Partenerul a raportat instalarea; se așteaptă confirmarea clientului." : "Партнёр сообщил об установке; ожидается подтверждение клиента.";
  if (evidence === "IN_PROGRESS") return ro ? "Proiectul de instalare este în curs." : "Проект установки в работе.";
  return ro ? "Proiectul de instalare nu este activ." : "Проект установки не активен.";
}
