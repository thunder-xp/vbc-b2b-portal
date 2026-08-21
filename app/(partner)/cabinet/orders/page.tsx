import Link from "next/link";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { listPartnerOrderHistoryAction } from "@/src/modules/orders/actions/order-history-list.actions";
import { OrderHistoryRefreshButton } from "@/src/modules/orders/components/OrderHistoryRefreshButton";
import { NumberedPagination } from "@/src/modules/platform-ui";
import {
  formatPartnerDate,
  formatPartnerRelativeAge,
  getOrdersCopy,
  orderStatusLabel,
} from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

const FILTERS = ["all", "processing", "open", "preorder", "test", "completed"] as const;

type OrdersPageProps = {
  searchParams: Promise<{
    status?: string | string[];
    query?: string | string[];
    page?: string | string[];
  }>;
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const [params, locale] = await Promise.all([
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = getOrdersCopy(locale);
  const filters = FILTERS.map(
    (value) =>
      [
        value,
        (
          {
            all: copy.all,
            processing: copy.active,
            open: copy.confirmed,
            preorder: copy.readyToShip,
            test: copy.needsClarification,
            completed: copy.completed,
          } as const
        )[value],
      ] as const,
  );
  const status = scalar(params.status);
  const query = scalar(params.query);
  const page = scalar(params.page);
  const result = await listPartnerOrderHistoryAction({
    filter: status,
    search: query,
    page,
  });
  if (!result.success) {
    return (
      <p className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        {copy.loadError}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <BehaviorViewEvent
        dedupeKey={`orders:${result.data.filter}:${result.data.search}:${result.data.page}`}
        eventName="order_list_viewed"
        resultCount={result.data.orders.length}
        route="/cabinet/orders"
        sourceSurface="order_history"
      />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">
            {copy.eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{copy.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">{copy.description}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {result.data.freshness.updatedAt
              ? `${copy.ordersUpdated} ${formatPartnerRelativeAge(result.data.freshness.updatedAt, locale)}`
              : copy.updateTimeUnknown}
          </p>
        </div>
        <OrderHistoryRefreshButton hasCachedOrders={result.data.total > 0} />
      </header>

      {result.data.bootstrapState &&
      result.data.bootstrapState.status !== "succeeded" ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3"
          role="status"
        >
          <p className="text-sm font-semibold text-zinc-900">
            {result.data.bootstrapState.status.startsWith("failed")
              ? copy.historyUpdating
              : copy.historySyncing}
          </p>
          <p className="mt-1 text-sm text-zinc-700">
            {result.data.bootstrapState.status.startsWith("failed")
              ? copy.currentOrdersAvailable
              : copy.historyPending}
          </p>
        </div>
      ) : null}

      <div className="space-y-3 border-y border-zinc-200 py-4">
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          aria-label={copy.state}
        >
          {filters.map(([value, label]) => (
            <Link
              className={
                result.data.filter === value
                  ? "whitespace-nowrap rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"
                  : "whitespace-nowrap rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              }
              href={filterHref(value, result.data.search)}
              key={value}
              prefetch={false}
            >
              {label}
            </Link>
          ))}
        </div>
        <form className="flex max-w-lg gap-2" method="get">
          <input name="status" type="hidden" value={result.data.filter} />
          <input
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            defaultValue={result.data.search}
            name="query"
            placeholder={copy.searchPlaceholder}
            type="search"
          />
          <button
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            type="submit"
          >
            {copy.search}
          </button>
        </form>
      </div>

      {result.data.orders.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center">
          {result.data.syncState?.status === "failed" &&
          result.data.total === 0 ? (
            <>
              <h2 className="font-semibold">{copy.sourceFailed}</h2>
              <p className="mt-2 text-sm text-zinc-600">
                {copy.retryOrContact}
              </p>
            </>
          ) : (
            <>
              <h2 className="font-semibold">{copy.notFound}</h2>
              <p className="mt-2 text-sm text-zinc-600">{copy.adjustSearch}</p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <div className="hidden grid-cols-[minmax(170px,1fr)_100px_120px_130px_130px_100px_120px_150px] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase text-zinc-500 xl:grid">
            <span>{copy.order}</span>
            <span>{copy.created}</span>
            <span>{copy.status}</span>
            <span>{copy.total}</span>
            <span>{copy.plannedShipment}</span>
            <span>{copy.composition}</span>
            <span>{copy.updated}</span>
            <span>{copy.actions}</span>
          </div>
          <ul className="divide-y divide-zinc-200">
            {result.data.orders.map((order) => (
              <li
                className="grid gap-2 p-4 xl:grid-cols-[minmax(170px,1fr)_100px_120px_130px_130px_100px_120px_150px] xl:items-center xl:gap-3"
                key={order.id}
              >
                <Link
                  className="grid gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 xl:contents"
                  href={`/cabinet/orders/${order.id}`}
                  prefetch={false}
                >
                  <span className="font-semibold text-zinc-950">
                    {order.primaryLabel}
                  </span>
                  <span className="text-sm text-zinc-600">
                    {formatDate(order.documentDate, locale)}
                  </span>
                  <span className="text-sm font-medium text-zinc-700">
                    {orderStatusLabel(order.statusCode, copy)}
                  </span>
                  <span className="text-sm font-semibold text-zinc-950">
                    {order.documentTotal ?? copy.hiddenCommercial}
                  </span>
                  <span className="text-sm text-zinc-600">
                    {order.deliveryDate
                      ? formatDate(order.deliveryDate, locale)
                      : copy.notSpecified}
                  </span>
                  <span className="text-sm text-zinc-600">
                    {order.positionCount} {copy.positions} ·{" "}
                    {order.totalUnitCount} {copy.units}
                  </span>
                  <span className="text-sm text-zinc-500">
                    {formatDateTime(order.lastSynchronizedAt, locale)}
                  </span>
                </Link>
                <Link
                  className="inline-flex min-h-11 w-fit items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:border-emerald-600 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  href={`/cabinet/orders/${order.id}/reorder`}
                  prefetch={false}
                >
                  {copy.repeat}
                </Link>
              </li>
            ))}
          </ul>
          <div className="px-4 pb-4">
            <NumberedPagination
              ariaLabel={copy.pages}
              currentPage={result.data.page}
              hrefForPage={(targetPage) =>
                pageHref(targetPage, result.data.filter, result.data.search)
              }
              locale={locale}
              totalPages={result.data.totalPages}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function scalar(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function filterHref(status: string, query: string): string {
  const params = new URLSearchParams({ status });
  if (query) params.set("query", query);
  return `/cabinet/orders?${params.toString()}`;
}

function pageHref(page: number, status: string, query: string): string {
  const params = new URLSearchParams({
    status,
    page: String(Math.max(1, page)),
  });
  if (query) params.set("query", query);
  return `/cabinet/orders?${params.toString()}`;
}

function formatDate(value: string, locale: "ru" | "ro"): string {
  return formatPartnerDate(value, locale);
}

function formatDateTime(value: string, locale: "ru" | "ro"): string {
  return formatPartnerDate(value, locale, {
    dateStyle: "short",
    timeStyle: "short",
  });
}
