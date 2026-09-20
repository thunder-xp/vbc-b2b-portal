import { ArrowRight, Building2, CircleAlert, CreditCard, FileText, Headphones, MessageCircle, PackageOpen, ReceiptText, RotateCcw, ShoppingBag } from "lucide-react";
import Link from "next/link";

import {
  AttentionItem,
  AttentionActionItem,
  CabinetStatusBadge,
  CabinetEmptyState,
  SectionHeader,
  WorkspaceHeader,
  cabinetPrimaryAction,
  cabinetPage,
  cabinetList,
  cabinetRow,
  cabinetSecondaryAction,
  cabinetSurface,
  cabinetTextAction,
} from "@/src/modules/cabinet-experience/components";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerMoney, orderStatus, orderStatusTone, paymentStatus, paymentStatusTone, serviceStatusLabel, serviceStatusTone } from "@/src/modules/final-customer/presentation";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { openFinalCustomerAttentionAction } from "@/src/modules/final-customer/actions";
import { customerAttentionCopy } from "@/src/modules/final-customer/attention-copy";
import { PurchaseObjectAssignment } from "@/src/modules/final-customer/components";
import { customerObjectTypeLabels } from "@/src/modules/final-customer/object-copy";

export default async function FinalCustomerOverviewPage() {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const service = createFinalCustomerService();
  const [overview, objectWorkspace] = await Promise.all([
    service.commandCenter(context.account),
    service.customerObjectWorkspace(context.account),
  ]);
  const ro = locale === "ro";
  const hasActivity = Boolean(
    overview.latestOrder
    || overview.recentPurchases.length
    || overview.latestRequest
    || overview.documentCount
    || overview.equipmentCount
    || objectWorkspace.objects.length
  );

  return (
    <main className={cabinetPage}>
      <WorkspaceHeader
        eyebrow={ro ? "Astăzi" : "Сегодня"}
        title={overview.displayName ?? (ro ? "Cont personal" : "Личный кабинет")}
        actions={hasActivity ? <Link className={cabinetPrimaryAction} href={`/catalog?lang=${locale}&view=all`}><ShoppingBag aria-hidden className="size-4" />{ro ? "În catalog" : "В каталог"}</Link> : undefined}
      />

      {overview.attentionItems.length ? (
        <section aria-label={ro ? "Necesită atenție" : "Требует внимания"} className="space-y-3">
          <SectionHeader title={ro ? "Necesită atenție" : "Требует внимания"} />
          <div className="space-y-2">{overview.attentionItems.map((item) => {
            const copy = customerAttentionCopy(item, locale);
            const Icon = item.eventCode === "CUSTOMER_SERVICE_NEED_INFO" ? CircleAlert : item.eventCode === "CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH" ? MessageCircle : item.eventCode === "CUSTOMER_PAYMENT_PAID" ? CreditCard : item.eventCode === "CUSTOMER_PAYMENT_FAILED" ? CircleAlert : item.eventCode === "CUSTOMER_PAYMENT_REFUNDED" ? RotateCcw : Headphones;
            return item.sourceKind === "SERVICE_REQUEST"
              ? <AttentionItem Icon={Icon} detail={copy.detail} href={item.actionPath} key={`${item.sourceKind}:${item.sourceId}`} status={copy.action} title={copy.title} />
              : <AttentionActionItem action={openFinalCustomerAttentionAction} fields={{ sourceKind: item.sourceKind, sourceId: item.sourceId }} Icon={Icon} detail={copy.detail} key={`${item.sourceKind}:${item.sourceId}`} priority={item.priority} status={copy.action} title={copy.title} />;
          })}</div>
        </section>
      ) : null}

      {!hasActivity ? (
        <CabinetEmptyState
          Icon={PackageOpen}
          actions={<><Link className={cabinetPrimaryAction} href={`/catalog?lang=${locale}&view=all`}>{ro ? "Deschide catalogul" : "Перейти в каталог"}</Link><Link className={cabinetSecondaryAction} href="/account/objects/new">{ro ? "Creează obiect" : "Создать объект"}</Link><Link className={cabinetSecondaryAction} href="/account/service/new">{ro ? "Solicitare de service" : "Обратиться в сервис"}</Link></>}
          body={ro ? "Aici vor apărea comenzile, cumpărăturile, documentele și solicitările dvs. de service." : "Здесь появятся ваши заказы, покупки, документы и обращения в сервис."}
          title={ro ? "Bine ați venit la NSD" : "Добро пожаловать в NSD"}
        />
      ) : (
        <div className="space-y-8">
          {overview.latestOrder ? (
            <section className="space-y-3" aria-labelledby="current-order-heading">
              <SectionHeader
                action={<Link className={cabinetTextAction} href="/account/orders">{ro ? "Toate comenzile" : "Все заказы"}<ArrowRight aria-hidden className="size-4" /></Link>}
                title={ro ? "Comanda curentă" : "Текущий заказ"}
              />
              <Link className={`group grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${cabinetSurface} ${cabinetRow}`} href={`/account/orders/${overview.latestOrder.id}`}>
                <span className="min-w-0"><span className="flex items-center gap-2"><ReceiptText aria-hidden className="size-5 text-emerald-700" /><strong>{overview.latestOrder.number}</strong></span><span className="mt-2 flex flex-wrap gap-2"><CabinetStatusBadge label={orderStatus(overview.latestOrder.status, locale)} tone={orderStatusTone(overview.latestOrder.status)} /><CabinetStatusBadge label={paymentStatus(overview.latestOrder.paymentState, locale)} tone={paymentStatusTone(overview.latestOrder.paymentState)} /></span></span>
                <span className="flex items-center justify-between gap-4 sm:justify-end"><strong className="tabular-nums">{customerMoney(overview.latestOrder.total, overview.latestOrder.currency, locale)}</strong><ArrowRight aria-hidden className="size-4 text-zinc-500 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" /></span>
              </Link>
            </section>
          ) : null}

          {overview.recentPurchases.length ? (
            <section className="space-y-3" aria-labelledby="recent-purchases-heading">
              <SectionHeader
                action={<Link className={cabinetTextAction} href="/account/purchases">{ro ? "Toate cumpărăturile" : "Все покупки"}<ArrowRight aria-hidden className="size-4" /></Link>}
                title={ro ? "Cumpărături recente" : "Недавние покупки"}
              />
              <div className={cabinetList}>
                {overview.recentPurchases.map((item) => <div className="flex min-h-16 items-center gap-3 px-4 py-3" key={item.id}><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100"><PackageOpen aria-hidden className="size-4.5 text-zinc-600" /></span><span className="min-w-0"><strong className="block truncate text-sm">{item.name}</strong><span className="font-mono text-xs text-zinc-500">SKU {item.sku}</span></span></div>)}
              </div>
            </section>
          ) : null}

          <section className="space-y-3" aria-labelledby="customer-objects-heading">
            <SectionHeader
              action={<Link className={cabinetTextAction} href="/account/objects">{ro ? "Toate obiectele" : "Все объекты"}<ArrowRight aria-hidden className="size-4" /></Link>}
              title={ro ? "Obiectele mele" : "Мои объекты"}
            />
            {objectWorkspace.objects.length ? <div className="grid gap-3 md:grid-cols-2">{objectWorkspace.objects.slice(0, 2).map((object) => <Link className={`group flex min-h-20 items-center gap-3 p-4 ${cabinetSurface} ${cabinetRow}`} href={`/account/objects/${object.id}`} key={object.id}><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Building2 aria-hidden className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block truncate">{object.name}</strong><span className="text-xs text-zinc-500">{customerObjectTypeLabels[locale][object.objectType]} · {ro ? `${object.productCount} produse` : `${object.productCount} товаров`}</span></span><ArrowRight aria-hidden className="size-4 text-zinc-500" /></Link>)}</div>
              : objectWorkspace.unlinkedPurchases[0] ? <PurchaseObjectAssignment locale={locale} objects={[]} orderId={objectWorkspace.unlinkedPurchases[0].orderId} orderNumber={objectWorkspace.unlinkedPurchases[0].orderNumber} />
                : <div className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${cabinetSurface}`}><div><h3 className="font-semibold">{ro ? "Uniți cumpărăturile, documentele și service-ul" : "Объедините покупки, документы и сервис"}</h3><p className="mt-1 text-sm text-zinc-600">{ro ? "Creați un obiect pentru casa, apartamentul sau afacerea dvs." : "Создайте объект для дома, квартиры или бизнеса."}</p></div><Link className={cabinetSecondaryAction} href="/account/objects/new">{ro ? "Creează obiect" : "Создать объект"}</Link></div>}
          </section>

          <section className="space-y-3" aria-labelledby="service-heading">
            <SectionHeader title={ro ? "Service" : "Сервис"} />
            {overview.latestRequest ? (
              <Link className={`group flex min-h-16 items-center gap-3 px-4 py-3 ${cabinetSurface} ${cabinetRow}`} href={`/account/service/${overview.latestRequest.id}`}><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Headphones aria-hidden className="size-4.5" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{overview.latestRequest.number}</strong><span className="mt-1 block"><CabinetStatusBadge label={serviceStatusLabel(overview.latestRequest.status, locale)} tone={serviceStatusTone(overview.latestRequest.status)} /></span></span><ArrowRight aria-hidden className="size-4 text-zinc-500 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" /></Link>
            ) : (
              <div className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${cabinetSurface}`}><div><h3 className="font-semibold">{ro ? "Aveți nevoie de ajutor cu echipamentul?" : "Нужна помощь с оборудованием?"}</h3><p className="mt-1 text-sm leading-5 text-zinc-600">{ro ? "Descrieți problema, iar noi vă vom răspunde în cabinet." : "Опишите проблему — ответ появится в кабинете."}</p></div><Link className={cabinetSecondaryAction} href="/account/service/new">{ro ? "Creați solicitare" : "Создать обращение"}</Link></div>
            )}
          </section>

          {overview.documentCount > 0 || overview.equipmentCount > 0 ? (
            <section className="flex flex-wrap gap-2 border-t border-zinc-200 pt-5" aria-label={ro ? "Alte date" : "Другие данные"}>
              {overview.documentCount > 0 ? <Link className={cabinetSecondaryAction} href="/account/documents"><FileText aria-hidden className="size-4" />{ro ? `Documente: ${overview.documentCount}` : `Документы: ${overview.documentCount}`}</Link> : null}
              {overview.equipmentCount > 0 ? <Link className={cabinetSecondaryAction} href="/account/equipment"><PackageOpen aria-hidden className="size-4" />{ro ? `Echipamente: ${overview.equipmentCount}` : `Оборудование: ${overview.equipmentCount}`}</Link> : null}
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
