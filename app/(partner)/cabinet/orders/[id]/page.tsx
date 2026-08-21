import Link from "next/link";
import { notFound } from "next/navigation";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { getPartnerOrderHistoryAction } from "@/src/modules/orders/actions";
import { SaveAsPurchasingListButton } from "@/src/modules/purchasing-lists/components";
import { SaveAsPurchaseTemplateButton } from "@/src/modules/purchase-templates/components";
import { listOrderDocumentsAction } from "@/src/modules/documents/actions";
import { RelatedDocuments } from "@/src/modules/documents/components";
import { ProductLineThumbnail } from "@/src/modules/catalog/components";
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
  searchParams,
}: OrderDetailPageProps) {
  const [resolvedParams, resolvedSearchParams, locale] = await Promise.all([
    params,
    searchParams,
    getPartnerLocale(),
  ]);
  const { id } = resolvedParams;
  const copy = getOrdersCopy(locale);
  const submitted = resolvedSearchParams?.submitted === "1";
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
  const documentsResult = await listOrderDocumentsAction(order.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BehaviorViewEvent
        dedupeKey={`order:${order.id}`}
        eventName="order_opened"
        route="/cabinet/orders/detail"
        sourceSurface="order_detail"
      />
      {submitted || !order.posted ? (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
          role="status"
        >
          <h1 className="text-lg font-semibold">{copy.accepted}</h1>
          <p className="mt-1 text-sm">{copy.acceptedMessage}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              className="text-sm font-semibold text-emerald-800 underline underline-offset-4"
              href="/cabinet/orders"
              prefetch={false}
            >
              {copy.allOrders}
            </Link>
            <Link
              className="text-sm font-semibold text-emerald-800 underline underline-offset-4"
              href="/cabinet/catalog"
              prefetch={false}
            >
              {copy.backCatalog}
            </Link>
          </div>
        </div>
      ) : null}

      <section className="border-b border-zinc-200 pb-6">
        <p className="text-xs font-semibold uppercase text-emerald-700">{copy.partnerOrder}</p>
        <h2 className="mt-1 text-2xl font-semibold">{order.primaryLabel}</h2>
        <p className="mt-2 text-sm font-medium text-zinc-700">
          {orderStatusLabel(order.statusCode, copy)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">{order.freshness.label}</p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={copy.company} value={order.companyName} />
          <Metric label={copy.orderDate} value={formatDate(order.documentDate, locale)} />
          <Metric
            label={copy.plannedShipment}
            value={
              order.deliveryDate ? formatDate(order.deliveryDate, locale) : copy.notSpecified
            }
          />
          {order.documentTotal ? (
            <Metric label={copy.total} value={order.documentTotal} />
          ) : null}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            href={`/cabinet/orders/${order.id}/reorder`}
            prefetch={false}
          >
            {copy.buyAgain}
          </Link>
          <Link
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
            href={`/cabinet/orders/${order.id}/reorder`}
            prefetch={false}
          >
            {copy.selectItems}
          </Link>
          <SaveAsPurchasingListButton orderId={order.id} source="order" />
          <SaveAsPurchaseTemplateButton
            source={{ type: "order", id: order.id }}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">{copy.currentOneCComposition}</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 bg-white">
          <ul className="divide-y divide-zinc-200">
            {order.lines.map((line, index) => (
              <li
                className="grid gap-3 p-4 sm:grid-cols-[4rem_minmax(0,1fr)_90px_140px_140px] sm:items-center"
                key={`${line.sku ?? line.productName}-${index}`}
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
              </li>
            ))}
          </ul>
        </div>
      </section>

      {order.portalSnapshot ? (
        <section className="border-t border-zinc-200 pt-6">
          <h2 className="text-lg font-semibold">{copy.submittedComposition}</h2>
          <p className="mt-1 text-sm text-zinc-500">{copy.submittedPricesNote}</p>
          <ul className="mt-3 divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {order.portalSnapshot.lines.map((line, index) => (
              <li
                className="grid gap-3 p-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center"
                key={`${line.sku}-${index}`}
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
                      size="compact"
                    />
                  </Link>
                ) : (
                  <ProductLineThumbnail
                    imageUrl={null}
                    productName={line.productName}
                    size="compact"
                  />
                )}
                <div>
                  {line.product ? (
                    <Link
                      className="font-medium text-zinc-950 hover:text-emerald-700"
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
                  <p className="text-xs text-zinc-500">
                    {line.sku} · {line.quantity} {copy.units}
                  </p>
                </div>
                <p className="text-sm font-semibold text-zinc-950">
                  {line.lineTotal ?? "—"}
                </p>
              </li>
            ))}
          </ul>
          {order.portalSnapshot.total ? (
            <p className="mt-3 font-semibold">
              {copy.total}: {order.portalSnapshot.total}
            </p>
          ) : (
            <p className="mt-3 text-sm text-zinc-600">
              {copy.accessHidden}
            </p>
          )}
        </section>
      ) : null}

      <RelatedDocuments
        documents={documentsResult.success ? documentsResult.data.items : []}
        emptyMessage={copy.documentsPending}
        title={copy.orderDocuments}
      />

      {order.timeline.length ? (
        <section className="border-t border-zinc-200 pt-6">
          <h2 className="text-lg font-semibold">{copy.history}</h2>
          <ol className="mt-3 space-y-3">
            {order.timeline.map((event, index) => (
              <li
                className="flex items-baseline justify-between gap-4 text-sm"
                key={`${event.occurredAt}-${index}`}
              >
                <span className="text-zinc-800">{orderEventLabel(event.eventType, copy)}</span>
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
      <dd className="mt-1 font-medium text-zinc-950">{value}</dd>
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
