import Link from "next/link";
import { notFound } from "next/navigation";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { getPartnerOrderHistoryAction } from "@/src/modules/orders/actions";
import { SaveAsPurchasingListButton } from "@/src/modules/purchasing-lists/components";
import { RelatedDocuments } from "@/src/modules/documents/components";
import { ProductLineThumbnail } from "@/src/modules/catalog/components";
import { HistoricalOrderCartButton } from "@/src/modules/orders/components/HistoricalOrderCartButton";
import { OrderReconciliationStatus } from "@/src/modules/orders/components/OrderReconciliationStatus";
import {
  formatPartnerDate,
  getOrdersCopy,
  orderEventLabel,
  orderStatusLabel,
} from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

type OrderDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ submitted?: string | string[] }>;
};

export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps) {
  const [resolvedParams, locale] = await Promise.all([
    params,
    getPartnerLocale(),
  ]);
  const { id } = resolvedParams;
  const copy = getOrdersCopy(locale);
  const result = await getPartnerOrderHistoryAction(id);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") notFound();
    return (
      <p className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        {copy.detailLoadError}
      </p>
    );
  }
  const order = result.data;
  const portalSubmissionState = order.portalSubmissionState;
  const portalAttemptUnresolved = portalSubmissionState
    && portalSubmissionState !== "confirmed_created";
  const showComposition = order.originType !== "partner_platform" || portalAttemptUnresolved;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BehaviorViewEvent
        dedupeKey={`order:${order.id}`}
        eventName="order_opened"
        route="/cabinet/orders/detail"
        sourceSurface="order_detail"
      />
      {portalAttemptUnresolved ? (
        <OrderReconciliationStatus
          initialState={{
            orderId: order.id,
            state: portalSubmissionState,
            external1cNumber: null,
          }}
          surface="order"
        />
      ) : null}
      <section>
        <h1 className="text-2xl font-semibold">{order.primaryLabel}</h1>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="order-metadata-row">
          <Metric label={copy.status} value={orderStatusLabel(order.statusCode, copy)} />
          <Metric label={copy.orderDate} value={formatDate(order.documentDate, locale)} />
          <Metric label={copy.plannedShipment} value={order.deliveryDate ? formatDate(order.deliveryDate, locale) : copy.notSpecified} />
          <Metric label={copy.total} value={order.documentTotal ?? "—"} />
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <HistoricalOrderCartButton locale={locale} orderId={order.id} />
          {!portalAttemptUnresolved ? <SaveAsPurchasingListButton orderId={order.id} source="order" /> : null}
        </div>
      </section>

      {showComposition ? <section>
        <h2 className="text-lg font-semibold">{portalAttemptUnresolved ? copy.preservedCartComposition : copy.composition}</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 bg-white">
          <ul className="divide-y divide-zinc-200">
            {order.lines.map((line, index) => (
              <li
                className="grid gap-3 p-4 sm:grid-cols-[4rem_minmax(0,1fr)_64px_100px_100px_44px] sm:items-center"
                key={line.lineId ?? `${line.sku ?? line.productName}-${index}`}
              >
                {line.product ? (
                  <Link
                    aria-label={`${copy.openProduct} ${line.productName}`}
                    className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                    href={`/cabinet/catalog/${line.product.slug}`}
                    prefetch={false}
                  >
                    <ProductLineThumbnail
                      imageUrl={line.product.thumbnail}
                      productName={line.productName}
                    />
                  </Link>
                ) : (
                  <ProductLineThumbnail
                    imageUrl={null}
                    productName={line.productName}
                  />
                )}
                <div>
                  {line.product ? (
                    <Link
                      className="font-medium text-zinc-950 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                      href={`/cabinet/catalog/${line.product.slug}`}
                      prefetch={false}
                    >
                      {line.productName}
                    </Link>
                  ) : (
                    <p className="font-medium text-zinc-950">
                      {line.productName}
                    </p>
                  )}
                  {line.sku ? (
                    <p className="text-xs text-zinc-500">{line.sku}</p>
                  ) : null}
                  {!line.product ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      {copy.historicalProduct}
                    </p>
                  ) : null}
                </div>
                <span className="text-sm text-zinc-700">
                  {line.quantity} {copy.units}
                </span>
                <span className="text-sm text-zinc-700">
                  {line.unitPrice ?? copy.priceHidden}
                </span>
                <span className="text-sm font-semibold text-zinc-950">
                  {line.lineTotal ?? "—"}
                </span>
                <HistoricalOrderCartButton compact lineId={line.lineId} locale={locale} orderId={order.id} />
              </li>
            ))}
          </ul>
        </div>
      </section> : null}

      {!portalAttemptUnresolved ? (
        <RelatedDocuments
          documents={order.documents}
          emptyMessage={copy.documentsPending}
          title={copy.orderDocuments}
        />
      ) : null}

      {order.timeline.length ? (
        <section className="border-t border-zinc-200 pt-6">
          <h2 className="text-lg font-semibold">{copy.history}</h2>
          <ol className="mt-3 space-y-3">
            {order.timeline.map((event, index) => (
              <li
                className="flex items-baseline justify-between gap-4 text-sm"
                key={`${event.occurredAt}-${index}`}
              >
                <span className="text-zinc-800">{orderEventLabel(event.eventType === "restored_from_1c" ? "sync_restored" : event.eventType, copy)}</span>
                <time className="shrink-0 text-zinc-500">
                  {formatDateTime(event.occurredAt, locale)}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums text-zinc-950">{value}</dd>
    </div>
  );
}

function formatDate(value: string, locale: "ru" | "ro"): string {
  return formatPartnerDate(value, locale);
}
function formatDateTime(value: string, locale: "ru" | "ro"): string {
  return formatPartnerDate(value, locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
