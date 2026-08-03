import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  PackageCheck,
  Users,
} from "lucide-react";

import { ProductCard } from "../../catalog/components/ProductCard";
import { DashboardPurchaseTemplateButton } from "../../purchase-templates/components/DashboardPurchaseTemplateButton";
import type { WorkspaceHomeDto } from "../services";
import { DashboardTrackedLink } from "./DashboardTrackedLink";
import { QuickActions } from "./QuickActions";
import { OpportunityCard } from "../../commercial-opportunities/components/OpportunityCard";
import { CampaignCard } from "../../commercial-campaigns/components/CampaignCard";
import { DocumentCard } from "../../documents/components/DocumentCard";
import { dismissPartnerMomentumPromptAction } from "../../partner-momentum/actions";

export function OperationalDashboard({
  workspace,
}: {
  workspace: WorkspaceHomeDto;
}) {
  return (
    <div className="space-y-7">
      <WorkspaceHeader workspace={workspace} />
      <AttentionSection items={workspace.attentionItems} />
      <PurchasingDynamicsSection summary={workspace.purchasingDynamics} />
      <div className="grid gap-5 xl:grid-cols-2">
        <OrdersSection summary={workspace.orderSummary} />
        <ShipmentsSection summary={workspace.shipmentSummary} />
      </div>
      <QuickActions actions={workspace.quickActions} />
      <ContinuationSection items={workspace.continuationItems} />
      <OpportunitySection opportunities={workspace.opportunities} />
      <CampaignSection campaigns={workspace.campaigns} />
      <RecentDocumentsSection documents={workspace.recentDocuments} />
      <ProductSection
        analyticsSurface="dashboard_reorder"
        products={workspace.reorderProducts}
        title="Вы покупали ранее"
        workspace={workspace}
      />
      <FinanceSection summary={workspace.financeSummary} />
      <ProductSection
        analyticsSurface="dashboard_offers"
        products={workspace.merchandisingProducts}
        title="Предложения Novotech"
        workspace={workspace}
      />
      <CompanySection summary={workspace.companySummary} />
    </div>
  );
}

function PurchasingDynamicsSection({ summary }: { summary: WorkspaceHomeDto["purchasingDynamics"] }) {
  if (!summary) return null;
  const synchronizing = summary.status === "history_sync_pending" || summary.status === "history_sync_delayed";
  return (
    <section aria-labelledby="purchasing-dynamics" className={synchronizing ? "border border-amber-200 bg-amber-50 p-4 sm:p-5" : "border border-emerald-200 bg-emerald-50 p-4 sm:p-5"} role={synchronizing ? "status" : undefined}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className={synchronizing ? "text-xs font-semibold uppercase text-amber-800" : "text-xs font-semibold uppercase text-emerald-800"}>Динамика закупок</p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950" id="purchasing-dynamics">{summary.title}</h2>
          <p className="mt-1 text-sm text-zinc-700">{summary.explanation}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary.actions.map((action) => (
            <DashboardTrackedLink className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500" eventName="momentum_action_opened" href={action.href} key={action.key} metadataSafe={{ action_type: action.key, status_band: summary.status }} sourceSurface="partner_momentum">
              {action.label}
            </DashboardTrackedLink>
          ))}
          {!synchronizing ? <form action={dismissPartnerMomentumPromptAction}>
            <input name="fingerprint" type="hidden" value={summary.sourceFingerprint} />
            <button className="min-h-11 px-3 text-sm font-medium text-zinc-600 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-500" type="submit">Скрыть</button>
          </form> : null}
        </div>
      </div>
    </section>
  );
}

function RecentDocumentsSection({ documents = [] }: { documents?: WorkspaceHomeDto["recentDocuments"] }) {
  if (!documents.length) return null;
  return <section aria-labelledby="dashboard-documents"><SectionHeading actionHref="/cabinet/documents" actionLabel="Все документы" id="dashboard-documents" title="Новые документы" /><div className="mt-2">{documents.slice(0,4).map((document)=><DocumentCard compact document={document} key={document.id}/>)}</div></section>;
}

function CampaignSection({ campaigns = [] }: { campaigns?: WorkspaceHomeDto["campaigns"] }) {
  if (!campaigns.length) return null;
  return <section aria-labelledby="dashboard-campaigns"><SectionHeading actionHref="/cabinet/offers" actionLabel="Все предложения" id="dashboard-campaigns" title="Специальные предложения" /><div className="mt-3 grid gap-3 xl:grid-cols-2">{campaigns.slice(0, 2).map((campaign) => <CampaignCard campaign={campaign} key={campaign.id} />)}</div></section>;
}

function OpportunitySection({ opportunities = [] }: { opportunities?: WorkspaceHomeDto["opportunities"] }) {
  if (!opportunities.length) return null;
  return <section aria-labelledby="dashboard-opportunities">
    <SectionHeading actionHref="/cabinet/opportunities" actionLabel="Смотреть все возможности" id="dashboard-opportunities" title="Возможности для закупки" />
    <div className="mt-3 grid gap-3 xl:grid-cols-2">{opportunities.slice(0, 4).map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} />)}</div>
  </section>;
}

function WorkspaceHeader({ workspace }: { workspace: WorkspaceHomeDto }) {
  return (
    <header className="border-b border-zinc-200 pb-5">
      <div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-950 sm:text-3xl">
            {workspace.identity.greeting}, {workspace.identity.firstName}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {workspace.company.name} · {workspace.company.role}
            {workspace.company.priceType
              ? ` · Статус партнёра: ${workspace.company.priceType}`
              : ""}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            {freshnessLabel(workspace)}
          </p>
        </div>
      </div>
    </header>
  );
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
              className="grid gap-3 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
              key={`${item.kind}:${item.id}`}
            >
              <span className="flex size-10 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                <AlertTriangle aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
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
                Открыть
                <ArrowRight aria-hidden="true" className="size-4" />
              </DashboardTrackedLink>
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

function ContinuationSection({
  items,
}: {
  items: WorkspaceHomeDto["continuationItems"];
}) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="dashboard-continuation">
      <SectionHeading id="dashboard-continuation" title="Продолжить работу" />
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <DashboardTrackedLink
            className="flex min-h-28 flex-col justify-between border border-zinc-200 bg-white p-4 hover:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500"
            eventName="dashboard_continue_work_clicked"
            href={item.href}
            key={`${item.kind}:${item.id}`}
            metadataSafe={{ workflow: item.kind }}
            sourceSurface="dashboard_continue_work"
          >
            <span>
              <span className="font-semibold text-zinc-950">{item.title}</span>
              <span className="mt-1 block text-sm text-zinc-600">
                {item.detail}
              </span>
            </span>
            <span className="mt-3 text-xs text-zinc-500">
              Обновлено {relativeDate(item.updatedAt)}
            </span>
          </DashboardTrackedLink>
        ))}
      </div>
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
        {summary.stale ? (
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-800">
            <Clock3 aria-hidden="true" className="size-4" />
            Финансовые данные требуют обновления
          </p>
        ) : null}
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

function CompanySection({
  summary,
}: {
  summary: WorkspaceHomeDto["companySummary"];
}) {
  if (!summary) return null;
  return (
    <section aria-labelledby="dashboard-company">
      <SectionHeading
        actionHref="/cabinet/company/users"
        actionLabel="Управление сотрудниками"
        id="dashboard-company"
        title="Моя компания"
      />
      <dl className="mt-3 grid gap-px border border-zinc-200 bg-zinc-200 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Активные сотрудники" value={summary.activeEmployees} />
        <Metric label="Ожидают приглашения" value={summary.pendingInvitations} />
        <Metric label="Приостановлены" value={summary.suspendedEmployees} />
        <Metric label="Только розничные цены" value={summary.retailOnlyEmployees} />
      </dl>
      <div className="grid gap-px border-x border-b border-zinc-200 bg-zinc-200 sm:grid-cols-2">
        <CompanyState
          label="Статус кабинета"
          value={summary.portalStatus === "active" ? "Активен" : "Требует проверки"}
        />
        <CompanyState
          label="Коммерческая готовность"
          value={summary.commercialReady ? "Настроена" : "Требует настройки"}
        />
      </div>
      {summary.expiringInvitations ? (
        <p className="border-x border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Скоро истекают приглашения: {summary.expiringInvitations}
        </p>
      ) : null}
    </section>
  );
}

function CompanyState({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-950">{value}</p>
    </div>
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
  if (/сотруд|приглаш/i.test(label)) {
    return <Users aria-hidden="true" className={className} />;
  }
  if (/отгруз|сегодня|дня|позже/i.test(label)) {
    return <CalendarClock aria-hidden="true" className={className} />;
  }
  if (/подтверж/i.test(label)) {
    return <PackageCheck aria-hidden="true" className={className} />;
  }
  if (/актив/i.test(label)) {
    return <Building2 aria-hidden="true" className={className} />;
  }
  return <Clock3 aria-hidden="true" className={className} />;
}

function freshnessLabel(workspace: WorkspaceHomeDto): string {
  const timestamps = workspace.commercialFreshness.flatMap((item) => {
    const value = item.freshness.updatedAt;
    return value && Number.isFinite(Date.parse(value)) ? [Date.parse(value)] : [];
  });
  if (!timestamps.length) return "Показаны последние подтверждённые данные";
  const latest = new Date(Math.max(...timestamps));
  return `Коммерческие данные обновлены ${new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Chisinau",
  }).format(latest)}`;
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
