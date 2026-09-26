import { Archive, ArrowRight, Building2, CalendarClock, CircleAlert, FileText, Headphones, PackageOpen, Pencil, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductThumbnail } from "@/src/modules/catalog/components";
import { CabinetStatusBadge, SectionHeader, cabinetList, cabinetPage, cabinetPrimaryAction, cabinetSecondaryAction, cabinetSurface, cabinetTextAction } from "@/src/modules/cabinet-experience/components";
import { archiveCustomerObjectAction } from "@/src/modules/final-customer/actions";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerObjectStatusLabel, customerObjectTypeLabels } from "@/src/modules/final-customer/object-copy";
import { customerDate, customerMoney, serviceStatusLabel, serviceStatusTone } from "@/src/modules/final-customer/presentation";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import type { CustomerObjectActivity, CustomerObjectWorkspaceDetail } from "@/src/modules/final-customer/types";

const OPEN_SERVICE_STATUSES = new Set(["NEW", "IN_REVIEW", "NEED_INFO", "ACCEPTED"]);

export default async function CustomerObjectDetailPage({ params }: { params: Promise<{ objectId: string }> }) {
  const [{ objectId }, context, locale] = await Promise.all([params, getFinalCustomerContext(), getFinalCustomerLocale()]);
  const detail = await createFinalCustomerService().customerObjectDetail(context.account, objectId, locale);
  if (!detail) notFound();
  const ro = locale === "ro";
  const object = detail.object;
  const openService = detail.serviceRequests.filter((request) => OPEN_SERVICE_STATUSES.has(request.status));
  const attention = openService.find((request) => request.status === "NEED_INFO") ?? openService[0] ?? null;
  const recentPurchases = detail.purchases.slice(0, 3);
  const allLines = detail.purchases.flatMap((purchase) => purchase.lines.map((line) => ({ line, purchase })));
  const documents = uniqueDocuments(detail);

  return <main className={cabinetPage}>
    <header className="space-y-3">
      <Link className={cabinetTextAction} href="/account/objects">← {ro ? "Obiectele mele" : "Мои объекты"}</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{ro ? "Pașaport digital de securitate" : "Цифровой паспорт безопасности"}</p><h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{object.name}</h1><p className="mt-1 text-sm text-zinc-500">{customerObjectTypeLabels[locale][object.objectType]}{object.locality ? ` · ${object.locality}` : ""}{object.addressLabel ? ` · ${object.addressLabel}` : ""}</p></div>
        <div className="flex flex-wrap gap-2">{object.status === "ACTIVE" ? <><Link className={cabinetSecondaryAction} href={`/account/objects/${object.id}/edit`}><Pencil aria-hidden className="size-4" />{ro ? "Editează" : "Изменить"}</Link><Link className={cabinetPrimaryAction} href={`/account/service/new?objectId=${object.id}`}><Headphones aria-hidden className="size-4" />{ro ? "Solicită service" : "Обратиться в сервис"}</Link></> : <CabinetStatusBadge label={customerObjectStatusLabel(object.status, locale)} tone="neutral" />}</div>
      </div>
    </header>

    {attention ? <section className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3" aria-labelledby="object-attention-heading"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800"><CircleAlert aria-hidden className="size-4" />{ro ? "Necesită atenție" : "Требует внимания"}</p><h2 className="mt-1 font-semibold" id="object-attention-heading">{attention.subject}</h2><p className="mt-1 line-clamp-2 text-sm text-zinc-700">{attention.latestCustomerVisibleUpdate?.body ?? (ro ? "Solicitarea este deschisă. Verificați starea și următorul pas." : "Обращение открыто. Проверьте статус и следующий шаг.")}</p></div><Link className={cabinetSecondaryAction} href={`/account/service/${attention.id}`}>{attention.status === "NEED_INFO" ? (ro ? "Răspunde" : "Ответить") : (ro ? "Deschide" : "Открыть")}</Link></div></section> : null}

    {detail.productGroups.length ? <section className="space-y-3" aria-labelledby="systems-heading"><SectionHeader title={ro ? "Sisteme și grupuri de produse" : "Системы и группы товаров"} /><ul className={cabinetList} id="systems-heading">{detail.productGroups.map((group) => <li className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={group.key}><div className="min-w-0"><strong className="block">{group.label}</strong><p className="mt-1 text-xs text-zinc-500">{ro ? "Echipament achiziționat" : "Приобретённое оборудование"} · {group.productCount} · {ro ? "cantitate" : "количество"}: {group.quantity} · {customerDate(group.latestPurchaseAt, locale)}{group.openServiceCount ? ` · ${ro ? "service deschis" : "открытый сервис"}: ${group.openServiceCount}` : ""}</p></div><a className={cabinetTextAction} href={`#system-${group.key}`}>{ro ? "Vezi echipamentul" : "Посмотреть оборудование"}<ArrowRight aria-hidden className="size-4" /></a></li>)}</ul></section> : null}

    {detail.productGroups.length ? <section className="space-y-4" aria-labelledby="equipment-heading"><SectionHeader title={ro ? "Echipament achiziționat" : "Приобретённое оборудование"} /><div className="space-y-5" id="equipment-heading">{detail.productGroups.map((group) => {
      const products = allLines.filter(({ line }) => group.lineIds.includes(line.id));
      return <article className="scroll-mt-24 space-y-2" id={`system-${group.key}`} key={group.key}><h3 className="text-sm font-semibold text-zinc-800">{group.label}</h3><ul className={cabinetList}>{products.map(({ line, purchase }) => <li className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 p-4 lg:grid-cols-[56px_minmax(0,1fr)_auto] lg:items-center" key={line.id}><div className="relative size-14 overflow-hidden rounded-lg bg-zinc-100"><ProductThumbnail alt={line.name} sizes="56px" src={line.currentProduct?.imageUrl ?? line.imageUrl} variant="xs" /></div><div className="min-w-0">{line.currentProduct ? <Link className="inline-flex min-h-11 items-center font-semibold hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-700" href={`/products/${line.currentProduct.slug}?lang=${locale}`}>{localizedProductName(line, locale)}</Link> : <p className="font-semibold">{line.name}</p>}<p className="font-mono text-xs text-zinc-500">SKU {line.sku} · {ro ? "Achiziționat" : "Приобретено"}: {line.quantity}</p><p className="mt-1 text-xs text-zinc-500">{customerDate(purchase.purchasedAt, locale)} · <Link className="font-mono font-semibold text-emerald-700" href={`/account/orders/${purchase.id}`}>{purchase.number}</Link></p><div className="mt-2 flex flex-wrap gap-2"><Link className={cabinetSecondaryAction} href={`/account/equipment/${line.id}`}>{ro ? "Deschide pașaportul" : "Открыть паспорт"}</Link>{line.currentProduct ? <Link className={cabinetSecondaryAction} href={`/products/${line.currentProduct.slug}?lang=${locale}`}>{ro ? "Produs" : "Товар"}</Link> : null}{line.documents[0] ? <a className={cabinetSecondaryAction} href={line.documents[0].url} rel="noreferrer" target="_blank"><FileText aria-hidden className="size-4" />{ro ? "Documente" : "Документы"}</a> : null}{object.status === "ACTIVE" ? <Link className={cabinetSecondaryAction} href={`/account/service/new?objectId=${object.id}&orderId=${purchase.id}&orderLineId=${line.id}`}><Headphones aria-hidden className="size-4" />{ro ? "Service pentru acest produs" : "Обратиться по этому товару"}</Link> : null}</div></div><strong className="col-start-2 tabular-nums lg:col-auto">{customerMoney(line.lineTotal, line.currency, locale)}</strong></li>)}</ul></article>;
    })}</div></section> : <section className={`p-4 sm:p-5 ${cabinetSurface}`}><PackageOpen aria-hidden className="size-6 text-zinc-400" /><h2 className="mt-3 font-semibold">{ro ? "Încă nu există echipament asociat acestui obiect." : "Пока к этому объекту не привязано оборудование."}</h2><div className="mt-4 flex flex-wrap gap-2"><Link className={cabinetPrimaryAction} href={detail.unlinkedPurchases[0] ? `/account/orders/${detail.unlinkedPurchases[0].orderId}` : "/account/purchases"}><ShoppingBag aria-hidden className="size-4" />{ro ? "Leagă o cumpărătură" : "Привязать покупку"}</Link>{object.status === "ACTIVE" ? <Link className={cabinetSecondaryAction} href={`/account/service/new?objectId=${object.id}`}><Headphones aria-hidden className="size-4" />{ro ? "Solicită service" : "Обратиться в сервис"}</Link> : null}</div></section>}

    {detail.unlinkedPurchaseCount > 0 && object.status === "ACTIVE" ? <section className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${cabinetSurface}`}><div><strong>{ro ? `${detail.unlinkedPurchaseCount} cumpărături nu sunt încă asociate unui obiect` : `${detail.unlinkedPurchaseCount} покупок ещё не привязано к объекту`}</strong><p className="mt-1 text-sm text-zinc-600">{ro ? "Alegeți obiectul din pagina comenzii." : "Выберите объект на странице заказа."}</p></div><Link className={cabinetSecondaryAction} href={`/account/orders/${detail.unlinkedPurchases[0]?.orderId ?? ""}`}>{ro ? "Distribuie" : "Распределить"}</Link></section> : null}

    {recentPurchases.length ? <section className="space-y-3" aria-labelledby="recent-purchases-heading"><SectionHeader action={<Link className={cabinetTextAction} href="/account/purchases">{ro ? "Toate cumpărăturile" : "Все покупки"}<ArrowRight aria-hidden className="size-4" /></Link>} title={ro ? "Cumpărături recente" : "Недавние покупки"} /><ul className={cabinetList} id="recent-purchases-heading">{recentPurchases.map((purchase) => <li key={purchase.id}><Link className="grid min-h-16 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" href={`/account/orders/${purchase.id}`}><span><strong className="font-mono text-sm">{purchase.number}</strong><span className="mt-1 block text-xs text-zinc-500">{customerDate(purchase.purchasedAt, locale)} · {purchase.lines.length} {ro ? "poziții" : "позиций"}</span></span><span className="flex items-center justify-between gap-3"><strong className="tabular-nums">{customerMoney(purchase.total, purchase.currency, locale)}</strong><ArrowRight aria-hidden className="size-4 text-zinc-400" /></span></Link></li>)}</ul></section> : null}

    {documents.length ? <section className="space-y-3" aria-labelledby="documents-heading"><SectionHeader action={<Link className={cabinetTextAction} href="/account/documents">{ro ? "Toate documentele" : "Все документы"}<ArrowRight aria-hidden className="size-4" /></Link>} title={ro ? "Documente" : "Документы"} /><ul className={cabinetList} id="documents-heading">{documents.map(({ document, productName }) => <li key={document.id}><a className="flex min-h-14 items-center justify-between gap-3 px-4 py-3" href={document.url} rel="noreferrer" target="_blank"><span className="min-w-0"><strong className="block truncate text-sm">{document.title}</strong><span className="block truncate text-xs text-zinc-500">{productName}</span></span><FileText aria-hidden className="size-4 shrink-0 text-emerald-700" /></a></li>)}</ul></section> : null}

    <section className="space-y-3" aria-labelledby="service-heading"><SectionHeader action={object.status === "ACTIVE" ? <Link className={cabinetTextAction} href={`/account/service/new?objectId=${object.id}`}>{ro ? "Solicitare nouă" : "Новое обращение"}</Link> : undefined} title={ro ? "Service" : "Сервис"} />{detail.serviceRequests.length ? <ul className={cabinetList} id="service-heading">{detail.serviceRequests.slice(0, 5).map((request) => <li key={request.id}><Link className="grid min-h-16 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" href={`/account/service/${request.id}`}><span className="min-w-0"><strong className="block truncate">{request.subject}</strong><span className="mt-1 block line-clamp-1 text-xs text-zinc-500">{request.latestCustomerVisibleUpdate?.body ?? request.number}</span></span><CabinetStatusBadge label={serviceStatusLabel(request.status, locale)} tone={serviceStatusTone(request.status)} /></Link></li>)}</ul> : <div className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${cabinetSurface}`}><p className="text-sm text-zinc-600">{ro ? "Nu există solicitări deschise pentru acest obiect." : "По этому объекту нет открытых обращений."}</p>{object.status === "ACTIVE" ? <Link className={cabinetSecondaryAction} href={`/account/service/new?objectId=${object.id}`}><Headphones aria-hidden className="size-4" />{ro ? "Solicită service" : "Обратиться в сервис"}</Link> : null}</div>}</section>

    {detail.activity.length ? <section className="space-y-3" aria-labelledby="activity-heading"><SectionHeader title={ro ? "Istoricul obiectului" : "История объекта"} /><ol className={cabinetList} id="activity-heading">{detail.activity.map((event) => <li className="flex min-h-14 items-center gap-3 px-4 py-3" key={event.id}><CalendarClock aria-hidden className="size-4 shrink-0 text-zinc-400" /><span className="min-w-0 flex-1 text-sm">{activityLabel(event, locale)}</span><time className="shrink-0 text-xs text-zinc-500">{customerDate(event.createdAt, locale)}</time></li>)}</ol></section> : null}

    {object.status === "ACTIVE" ? <form action={archiveCustomerObjectAction} className="border-t border-zinc-200 pt-4"><input name="objectId" type="hidden" value={object.id} /><input name="expectedVersion" type="hidden" value={object.version} /><button className={cabinetSecondaryAction} type="submit"><Archive aria-hidden className="size-4" />{ro ? "Arhivează obiectul" : "Архивировать объект"}</button><p className="mt-2 text-xs text-zinc-500">{ro ? "Istoricul, cumpărăturile, documentele și service-ul se păstrează." : "История, покупки, документы и обращения сохранятся."}</p></form> : <section className="border-t border-zinc-200 pt-4"><p className="flex items-center gap-2 text-sm text-zinc-600"><Building2 aria-hidden className="size-4" />{ro ? "Obiectul este arhivat și rămâne disponibil pentru istoric." : "Объект архивирован и доступен для истории."}</p></section>}
  </main>;
}

function localizedProductName(line: CustomerObjectWorkspaceDetail["purchases"][number]["lines"][number], locale: "ru" | "ro") {
  return (locale === "ro" ? line.currentProduct?.nameRo : line.currentProduct?.nameRu) || line.name;
}

function uniqueDocuments(detail: CustomerObjectWorkspaceDetail) {
  const result = new Map<string, { document: CustomerObjectWorkspaceDetail["purchases"][number]["lines"][number]["documents"][number]; productName: string }>();
  for (const purchase of detail.purchases) for (const line of purchase.lines) for (const document of line.documents) {
    if (!result.has(document.id)) result.set(document.id, { document, productName: line.name });
  }
  return [...result.values()];
}

function activityLabel(event: CustomerObjectActivity, locale: "ru" | "ro") {
  const ro = locale === "ro";
  if (event.eventType === "OBJECT_CREATED") return ro ? "Obiect creat" : "Объект создан";
  if (event.eventType === "OBJECT_UPDATED") return ro ? "Datele obiectului au fost actualizate" : "Данные объекта изменены";
  if (event.eventType === "OBJECT_ARCHIVED") return ro ? "Obiect arhivat" : "Объект архивирован";
  if (event.eventType === "PURCHASE_LINKED") return ro ? "Cumpărătură asociată" : "Покупка привязана";
  if (event.eventType === "PURCHASE_REASSIGNED") return ro ? "Cumpărătură mutată între obiecte" : "Покупка перемещена между объектами";
  if (event.eventType === "SERVICE_REQUEST_OPENED") return ro ? "Solicitare de service deschisă" : "Открыто обращение в сервис";
  return ro ? "Starea solicitării de service s-a schimbat" : "Статус обращения в сервис изменён";
}
