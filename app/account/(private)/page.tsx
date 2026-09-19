import { ArrowRight, CircleAlert, CreditCard, FileText, Headphones, MessageCircle, PackageOpen, ReceiptText, RotateCcw, ShoppingBag } from "lucide-react";
import Link from "next/link";

import {
  AttentionItem,
  AttentionActionItem,
  CabinetEmptyState,
  SectionHeader,
  WorkspaceHeader,
  cabinetPrimaryAction,
  cabinetSecondaryAction,
} from "@/src/modules/cabinet-experience/components";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerMoney, orderStatus, paymentStatus, serviceStatusLabel } from "@/src/modules/final-customer/presentation";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { openFinalCustomerAttentionAction } from "@/src/modules/final-customer/actions";
import { customerAttentionCopy } from "@/src/modules/final-customer/attention-copy";

export default async function FinalCustomerOverviewPage() {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const overview = await createFinalCustomerService().commandCenter(context.account);
  const ro = locale === "ro";
  const hasActivity = Boolean(
    overview.latestOrder
    || overview.recentPurchases.length
    || overview.latestRequest
    || overview.documentCount
    || overview.equipmentCount,
  );

  return (
    <main className="mx-auto max-w-5xl space-y-7 px-4 py-6 sm:py-8">
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
          actions={<><Link className={cabinetPrimaryAction} href={`/catalog?lang=${locale}&view=all`}>{ro ? "Deschide catalogul" : "Перейти в каталог"}</Link><Link className={cabinetSecondaryAction} href="/account/service/new">{ro ? "Solicitare de service" : "Обратиться в сервис"}</Link></>}
          body={ro ? "Aici vor apărea comenzile, cumpărăturile, documentele și solicitările dvs. de service." : "Здесь появятся ваши заказы, покупки, документы и обращения в сервис."}
          title={ro ? "Bine ați venit la NSD" : "Добро пожаловать в NSD"}
        />
      ) : (
        <div className="space-y-8">
          {overview.latestOrder ? (
            <section className="space-y-3" aria-labelledby="current-order-heading">
              <SectionHeader
                action={<Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700" href="/account/orders">{ro ? "Toate comenzile" : "Все заказы"}<ArrowRight aria-hidden className="size-4" /></Link>}
                title={ro ? "Comanda curentă" : "Текущий заказ"}
              />
              <Link className="group grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 hover:border-emerald-300 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" href={`/account/orders/${overview.latestOrder.id}`}>
                <span className="min-w-0"><span className="flex items-center gap-2"><ReceiptText aria-hidden className="size-5 text-emerald-700" /><strong>{overview.latestOrder.number}</strong></span><span className="mt-2 block text-sm text-zinc-600">{orderStatus(overview.latestOrder.status, locale)} · {paymentStatus(overview.latestOrder.paymentState, locale)}</span></span>
                <span className="flex items-center justify-between gap-4 sm:justify-end"><strong className="tabular-nums">{customerMoney(overview.latestOrder.total, overview.latestOrder.currency, locale)}</strong><ArrowRight aria-hidden className="size-4 text-zinc-500 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            </section>
          ) : null}

          {overview.recentPurchases.length ? (
            <section className="space-y-3" aria-labelledby="recent-purchases-heading">
              <SectionHeader
                action={<Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700" href="/account/purchases">{ro ? "Toate cumpărăturile" : "Все покупки"}<ArrowRight aria-hidden className="size-4" /></Link>}
                title={ro ? "Cumpărături recente" : "Недавние покупки"}
              />
              <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
                {overview.recentPurchases.map((item) => <div className="flex min-h-16 items-center gap-3 px-4 py-3" key={item.id}><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100"><PackageOpen aria-hidden className="size-5 text-zinc-600" /></span><span className="min-w-0"><strong className="block truncate text-sm">{item.name}</strong><span className="font-mono text-xs text-zinc-500">SKU {item.sku}</span></span></div>)}
              </div>
            </section>
          ) : null}

          <section className="space-y-3" aria-labelledby="service-heading">
            <SectionHeader title={ro ? "Service" : "Сервис"} />
            {overview.latestRequest ? (
              <Link className="group flex min-h-16 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-emerald-300" href={`/account/service/${overview.latestRequest.id}`}><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Headphones aria-hidden className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{overview.latestRequest.number}</strong><span className="text-sm text-zinc-600">{serviceStatusLabel(overview.latestRequest.status, locale)}</span></span><ArrowRight aria-hidden className="size-4 text-zinc-500 transition-transform group-hover:translate-x-0.5" /></Link>
            ) : (
              <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">{ro ? "Aveți nevoie de ajutor cu echipamentul?" : "Нужна помощь с оборудованием?"}</h3><p className="mt-1 text-sm text-zinc-600">{ro ? "Descrieți problema, iar noi vă vom răspunde în cabinet." : "Опишите проблему — ответ появится в кабинете."}</p></div><Link className={cabinetSecondaryAction} href="/account/service/new">{ro ? "Creați solicitare" : "Создать обращение"}</Link></div>
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
