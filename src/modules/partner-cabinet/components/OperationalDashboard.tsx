import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  PackageCheck,
  X,
} from "lucide-react";

import { ProductCard } from "../../catalog/components/ProductCard";
import { DashboardPurchaseTemplateButton } from "../../purchase-templates/components/DashboardPurchaseTemplateButton";
import type { WorkspaceHomeDto } from "../services";
import { DashboardTrackedLink } from "./DashboardTrackedLink";
import { OpportunityCard } from "../../commercial-opportunities/components/OpportunityCard";
import { CampaignCard } from "../../commercial-campaigns/components/CampaignCard";
import { dismissDashboardAttentionAction } from "../actions";
import { SupportDashboardBlock } from "../../partner-support";

export function OperationalDashboard({
  workspace,
}: {
  workspace: WorkspaceHomeDto;
}) {
  return (
    <div className="space-y-7">
      <AttentionSection items={workspace.attentionItems} />
      <SupportDashboardBlock items={workspace.supportTickets ?? []} />
      <div className="grid gap-5 xl:grid-cols-2">
        <OrdersSection summary={workspace.orderSummary} />
        <ShipmentsSection summary={workspace.shipmentSummary} />
      </div>
      <ProductSection
        analyticsSurface="dashboard_reorder"
        products={workspace.reorderProducts}
        title="Вы покупали ранее"
        workspace={workspace}
      />
      <FinanceSection summary={workspace.financeSummary} />
      <OpportunitySection opportunities={workspace.opportunities} />
      <NovotechOffersSection
        campaigns={workspace.campaigns}
        products={workspace.merchandisingProducts}
        workspace={workspace}
      />
    </div>
  );
}

function NovotechOffersSection({ campaigns = [], products = [], workspace }: {
  campaigns?: WorkspaceHomeDto["campaigns"];
  products?: WorkspaceHomeDto["merchandisingProducts"];
  workspace: WorkspaceHomeDto;
}) {
  if (!campaigns.length && !products.length) return null;
  return (
    <section aria-labelledby="dashboard-novotech-offers">
      <SectionHeading actionHref="/cabinet/offers" actionLabel="Все предложения" id="dashboard-novotech-offers" title="Предложения Novotech" />
      {campaigns.length ? <div className="mt-3 grid gap-3 xl:grid-cols-2">{campaigns.slice(0, 2).map((campaign) => <CampaignCard campaign={campaign} key={campaign.id} />)}</div> : null}
      {products.length ? <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{products.slice(0, 5).map((item) => <ProductCard analyticsEventName="dashboard_novotech_offer_opened" analyticsSurface="dashboard_offers" capabilities={workspace.capabilities.productCard} commercialView={item.commercialView} key={item.product.id} product={item.product} />)}</div> : null}
    </section>
  );
}

function OpportunitySection({ opportunities = [] }: { opportunities?: WorkspaceHomeDto["opportunities"] }) {
  if (!opportunities.length) return null;
  return <section aria-labelledby="dashboard-opportunities">
    <SectionHeading actionHref="/cabinet/opportunities" actionLabel="Смотреть все возможности" id="dashboard-opportunities" title="Возможности для закупки" />
    <div className="mt-3 grid gap-3 xl:grid-cols-2">{opportunities.slice(0, 4).map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} />)}</div>
  </section>;
}

function AttentionSection({
  items,
}: {
  items: WorkspaceHomeDto["attentionItems"];
}) {
  return (
    <section aria-labelledby="dashboard-attention">
      <SectionHeading id="dashboard-attention" title="Требует внимания" />
      {items.length ? (
        <ul className="mt-3 divide-y divide-zinc-200 border border-zinc-200 bg-white">
          {items.map((item) => (
            <li
              className="grid gap-3 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center"
              key={`${item.kind}:${item.id}`}
            >
              <span className="flex size-10 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                <AlertTriangle aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                {item.isTest ? (
                  <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                    <span className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">ТЕСТОВЫЙ</span>
                    {item.orderNumber ? <span>{item.orderNumber}</span> : null}
                    {item.plannedDate ? <span>до {formatDate(item.plannedDate)}</span> : null}
                  </p>
                ) : null}
                <p className="font-semibold text-zinc-950">{item.title}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {item.consequence}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {relativeDate(item.occurredAt)}
                </p>
              </div>
              <DashboardTrackedLink
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500"
                eventName="dashboard_attention_opened"
                href={item.href}
                metadataSafe={{ kind: item.kind }}
                sourceSurface="dashboard_attention"
              >
                {item.ctaLabel}
                <ArrowRight aria-hidden="true" className="size-4" />
              </DashboardTrackedLink>
              <form action={dismissDashboardAttentionAction}>
                <input name="itemId" type="hidden" value={item.id} />
                <input name="sourceFingerprint" type="hidden" value={item.sourceFingerprint} />
                <button aria-label="Скрыть сообщение" className="inline-flex size-11 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" title="Скрыть сообщение" type="submit">
                  <X aria-hidden="true" className="size-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 flex items-center gap-3 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
          Всё в порядке. Срочных действий нет.
        </div>
      )}
    </section>
  );
}

function OrdersSection({
  summary,
}: {
  summary: WorkspaceHomeDto["orderSummary"];
}) {
  return (
    <section aria-labelledby="dashboard-orders" className="min-w-0">
      <SectionHeading
        actionHref="/cabinet/orders"
        actionLabel="Все заказы"
        id="dashboard-orders"
        title="Заказы"
      />
      <dl className="mt-3 grid grid-cols-2 gap-px border border-zinc-200 bg-zinc-200 sm:grid-cols-4">
        <Metric label="Активные" value={summary.active} />
        <Metric label="Подтверждённые" value={summary.confirmed} />
        <Metric label="Требуют внимания" value={summary.attention} />
        <Metric label="В обработке" value={summary.portalProcessing} />
      </dl>
      {summary.recent.length ? (
        <ul className="divide-y divide-zinc-200 border-x border-b border-zinc-200 bg-white">
          {summary.recent.map((order) => (
            <li className="p-4" key={order.id}>
              <DashboardTrackedLink
                className="flex min-h-11 items-start justify-between gap-3 rounded-sm focus-visible:ring-2 focus-visible:ring-emerald-500"
                eventName="dashboard_order_opened"
                href={order.href}
                sourceSurface="dashboard_orders"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-zinc-950">
                    {order.number}
                  </span>
                  {order.isTest ? <span className="ml-2 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">ТЕСТОВЫЙ</span> : null}
                  <span className="mt-1 block text-xs text-zinc-500">
                    {formatDate(order.date)} · {order.positionCount} поз.
                    {order.plannedDate
                      ? ` · отгрузка ${formatDate(order.plannedDate)}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs font-semibold text-zinc-600">
                  {order.statusLabel}
                  {order.formattedTotal ? (
                    <span className="mt-1 block text-zinc-950">
                      {order.formattedTotal}
                    </span>
                  ) : null}
                </span>
              </DashboardTrackedLink>
            </li>
          ))}
        </ul>
      ) : (
        <CompactEmpty
          actionHref="/cabinet/catalog"
          actionLabel="Перейти в каталог"
          message="У компании пока нет заказов."
        />
      )}
    </section>
  );
}

function ShipmentsSection({
  summary,
}: {
  summary: WorkspaceHomeDto["shipmentSummary"];
}) {
  return (
    <section aria-labelledby="dashboard-shipments" className="min-w-0">
      <SectionHeading
        actionHref="/cabinet/reservation-requests"
        actionLabel="Все отгрузки"
        id="dashboard-shipments"
        title="Ближайшие отгрузки"
      />
      <dl className="mt-3 grid grid-cols-2 gap-px border border-zinc-200 bg-zinc-200 sm:grid-cols-4">
        <Metric label="Просрочено" value={summary.overdue} />
        <Metric label="Сегодня" value={summary.today} />
        <Metric label="3 дня" value={summary.nextThreeDays} />
        <Metric label="Позже" value={summary.later} />
      </dl>
      {summary.items.length ? (
        <ul className="divide-y divide-zinc-200 border-x border-b border-zinc-200 bg-white">
          {summary.items.map((shipment) => (
            <li className="p-4" key={shipment.id}>
              <DashboardTrackedLink
                className="flex min-h-11 items-start justify-between gap-3 rounded-sm focus-visible:ring-2 focus-visible:ring-emerald-500"
                eventName="dashboard_shipment_opened"
                href={shipment.href}
                sourceSurface="dashboard_shipments"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-zinc-950">
                    {shipment.orderNumber}
                  </span>
                  {shipment.isTest ? <span className="ml-2 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">ТЕСТОВЫЙ</span> : null}
                  <span className="mt-1 block text-xs text-zinc-500">
                    {shipment.positionCount} поз. · {shipment.totalUnits} шт.
                    {shipment.pendingDateChange ? " · перенос рассматривается" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold text-zinc-950">
                    {formatDate(shipment.plannedDate)}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {shipmentDistance(shipment.plannedDate)}
                  </span>
                </span>
              </DashboardTrackedLink>
            </li>
          ))}
        </ul>
      ) : (
        <CompactEmpty message="Ближайшие отгрузки не запланированы." />
      )}
    </section>
  );
}

function ProductSection({
  analyticsSurface,
  products,
  title,
  workspace,
}: {
  analyticsSurface: string;
  products: WorkspaceHomeDto["reorderProducts"];
  title: string;
  workspace: WorkspaceHomeDto;
}) {
  if (!products.length) return null;
  return (
    <section aria-label={title}>
      <SectionHeading
        actionHref="/cabinet/catalog"
        actionLabel="Открыть каталог"
        id={`dashboard-${analyticsSurface}`}
        title={title}
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {products.slice(0, 5).map((item) => (
          <ProductCard
              analyticsEventName={
                analyticsSurface === "dashboard_offers"
                  ? "dashboard_novotech_offer_opened"
                  : "dashboard_previous_purchase_opened"
              }
              analyticsSurface={analyticsSurface}
              cartSuccessEventName={
                analyticsSurface === "dashboard_reorder"
                  ? "dashboard_reorder_product_added"
                  : undefined
              }
              capabilities={workspace.capabilities.productCard}
              commercialView={item.commercialView}
              contextLine={analyticsSurface === "dashboard_reorder" ? purchaseContext(item) : undefined}
            product={item.product}
            key={item.product.id}
          />
        ))}
      </div>
      {analyticsSurface === "dashboard_reorder" ? <DashboardPurchaseTemplateButton items={products.slice(0, 5).map((item) => ({ productId: item.product.id, quantity: Math.max(1, Math.trunc(item.typicalQuantity ?? 1)) }))} /> : null}
    </section>
  );
}

function purchaseContext(item: WorkspaceHomeDto["reorderProducts"][number]): string {
  const date = item.lastPurchasedAt ? formatDate(item.lastPurchasedAt) : "дата уточняется";
  const quantity = Math.max(1, Math.trunc(item.typicalQuantity ?? 1));
  return `Последняя покупка: ${date} · обычно ${quantity} шт.`;
}

function FinanceSection({
  summary,
}: {
  summary: WorkspaceHomeDto["financeSummary"];
}) {
  if (!summary) return null;
  return (
    <section aria-labelledby="dashboard-finance">
      <SectionHeading
        actionHref="/cabinet/finance"
        actionLabel="Открыть финансы"
        id="dashboard-finance"
        title="Финансы"
      />
      <div className="mt-3 border border-zinc-200 bg-white p-4">
        {summary.lastSuccessfulAt ? <p className="mb-3 text-xs text-zinc-500">Обновлено: {formatDate(summary.lastSuccessfulAt)}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summary.totals.map((total) => (
            <div className="bg-zinc-50 p-3" key={total.currency}>
              <p className="text-xs font-semibold text-zinc-500">
                {total.currency}
              </p>
              <p className="mt-2 text-sm text-zinc-700">
                К оплате:{" "}
                <strong className="text-zinc-950">
                  {formatAmount(total.receivable, total.currency)}
                </strong>
              </p>
              <p className="mt-1 text-sm text-zinc-700">
                Аванс:{" "}
                <strong className="text-zinc-950">
                  {formatAmount(total.advance, total.currency)}
                </strong>
              </p>
            </div>
          ))}
          <div className="flex items-center gap-3 bg-zinc-50 p-3">
            <CircleDollarSign
              aria-hidden="true"
              className="size-6 text-emerald-700"
            />
            <div>
              <p className="text-xs text-zinc-500">Договоры с балансом</p>
              <p className="font-semibold text-zinc-950">
                {summary.contractCount}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  actionHref,
  actionLabel,
  id,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  id: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-zinc-950" id={id}>
        {title}
      </h2>
      {actionHref && actionLabel ? (
        <DashboardTrackedLink
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500"
          eventName={sectionEvent(id)}
          href={actionHref}
          sourceSurface={id}
        >
          {actionLabel}
          <ArrowRight aria-hidden="true" className="size-4" />
        </DashboardTrackedLink>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-h-20 items-center gap-3 bg-white p-3">
      {metricIcon(label)}
      <div>
        <dt className="text-xs text-zinc-500">{label}</dt>
        <dd className="mt-1 text-xl font-semibold text-zinc-950">{value}</dd>
      </div>
    </div>
  );
}

function CompactEmpty({
  actionHref,
  actionLabel,
  message,
}: {
  actionHref?: string;
  actionLabel?: string;
  message: string;
}) {
  return (
    <div className="border-x border-b border-zinc-200 bg-white p-4 text-sm text-zinc-600">
      <p>{message}</p>
      {actionHref && actionLabel ? (
        <DashboardTrackedLink
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-emerald-700"
          eventName="dashboard_quick_action_clicked"
          href={actionHref}
          sourceSurface="dashboard_empty_state"
        >
          {actionLabel}
        </DashboardTrackedLink>
      ) : null}
    </div>
  );
}

function sectionEvent(id: string) {
  if (id.includes("finance")) return "dashboard_finance_opened" as const;
  if (id.includes("company")) return "dashboard_company_opened" as const;
  if (id.includes("shipment")) return "dashboard_shipment_opened" as const;
  if (id.includes("order")) return "dashboard_order_opened" as const;
  return "dashboard_quick_action_clicked" as const;
}

function metricIcon(label: string) {
  const className = "size-5 shrink-0 text-emerald-700";
  if (/отгруз|сегодня|дня|позже/i.test(label)) {
    return <CalendarClock aria-hidden="true" className={className} />;
  }
  if (/подтверж/i.test(label)) {
    return <PackageCheck aria-hidden="true" className={className} />;
  }
  return <Clock3 aria-hidden="true" className={className} />;
}

function relativeDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "дата уточняется";
  const days = Math.round((timestamp - Date.now()) / 86_400_000);
  if (days === 0) return "сегодня";
  if (days === -1) return "вчера";
  if (days === 1) return "завтра";
  return formatDate(value);
}

function shipmentDistance(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const today = new Date();
  const current = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const days = Math.round((date.getTime() - current) / 86_400_000);
  if (days < 0) return `просрочено на ${Math.abs(days)} дн.`;
  if (days === 0) return "сегодня";
  return `через ${days} дн.`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date)
    : "Дата уточняется";
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
