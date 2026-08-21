import { CalendarClock } from "lucide-react";
import Link from "next/link";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { listPlannedShipmentsAction } from "@/src/modules/orders/actions";
import {
  CancelOrderDateChangeButton,
  OrderDateChangeDialog,
} from "@/src/modules/orders/components";
import type {
  PlannedShipmentDto,
  PlannedShipmentIndicator,
} from "@/src/modules/orders/services";
import {
  dateRequestStatusLabel,
  formatPartnerDate,
  formatPartnerDateTime,
  getOrdersCopy,
  orderStatusLabel,
  projectCopy,
  type PartnerLocale,
} from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function PlannedShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [params, locale] = await Promise.all([
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = projectCopy(locale);
  const ordersCopy = getOrdersCopy(locale);
  const groups: Array<{
    indicators: PlannedShipmentIndicator[];
    title: string;
  }> = [
    { indicators: ["overdue"], title: copy.overdue },
    { indicators: ["today"], title: copy.today },
    { indicators: ["soon"], title: copy.threeDays },
    { indicators: ["scheduled"], title: copy.later },
  ];
  const page = typeof params.page === "string" ? params.page : null;
  const result = await listPlannedShipmentsAction({ page });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BehaviorViewEvent
        dedupeKey={`shipments:${page ?? "1"}`}
        eventName="shipment_viewed"
        resultCount={result.success ? result.data.shipments.length : undefined}
        route="/cabinet/reservation-requests"
        sourceSurface="planned_shipments"
      />
      <header className="border-b border-zinc-200 pb-5">
        <p className="text-xs font-semibold uppercase text-emerald-700">
          {copy.reservationEyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{copy.shipmentsTitle}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {copy.shipmentsDescription}
        </p>
      </header>

      {!result.success ? (
        <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
          {copy.shipmentsError}
        </p>
      ) : result.data.shipments.length ? (
        <>
          <div className="space-y-4">
            {groups.map((group) => {
              const shipments = result.data.shipments.filter((shipment) =>
                group.indicators.includes(shipment.dateIndicator),
              );
              if (!shipments.length) return null;
              return (
                <section
                  className="overflow-hidden rounded-md border border-zinc-200 bg-white"
                  key={group.title}
                >
                  <h2 className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-950">
                    {group.title} · {shipments.length}
                  </h2>
                  <div className="hidden grid-cols-[minmax(11rem,1fr)_9rem_9rem_7rem_8rem_11rem] gap-3 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase text-zinc-500 lg:grid">
                    <span>{copy.order}</span>
                    <span>{copy.plannedShipment}</span>
                    <span>{copy.oneCState}</span>
                    <span>{copy.composition}</span>
                    <span>{copy.term}</span>
                    <span>{copy.action}</span>
                  </div>
                  <ul className="divide-y divide-zinc-200">
                    {shipments.map((shipment) => (
                      <li
                        className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(11rem,1fr)_9rem_9rem_7rem_8rem_11rem] lg:items-center"
                        key={shipment.id}
                      >
                        <div>
                          <Link
                            className="font-semibold text-zinc-950 hover:text-emerald-700"
                            href={`/cabinet/orders/${shipment.id}`}
                            prefetch={false}
                          >
                            {shipment.primaryLabel}
                          </Link>
                          <div className="mt-1 text-xs text-zinc-500">
                            {copy.updated}{" "}
                            {formatPartnerDateTime(
                              shipment.lastSynchronizedAt,
                              locale,
                            )}
                          </div>
                        </div>
                        <span className="text-sm text-zinc-700">
                          {formatPartnerDate(shipment.deliveryDate!, locale)}
                        </span>
                        <span className="text-sm text-zinc-700">
                          {orderStatusLabel(shipment.statusCode, ordersCopy)}
                        </span>
                        <span className="text-sm text-zinc-600">
                          {shipment.positionCount} {ordersCopy.positions} ·{" "}
                          {shipment.totalUnitCount} {copy.units}
                        </span>
                        <span
                          className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${indicatorTone(shipment.dateIndicator)}`}
                        >
                          {group.title}
                        </span>
                        <RequestCell
                          copy={copy}
                          locale={locale}
                          shipment={shipment}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          {result.data.totalPages > 1 && (
            <nav
              aria-label={copy.shipmentPages}
              className="flex items-center justify-between text-sm"
            >
              <PageLink
                disabled={result.data.page <= 1}
                page={result.data.page - 1}
              >
                {copy.back}
              </PageLink>
              <span className="text-zinc-500">
                {copy.page} {result.data.page} {copy.of}{" "}
                {result.data.totalPages}
              </span>
              <PageLink
                disabled={result.data.page >= result.data.totalPages}
                page={result.data.page + 1}
              >
                {copy.next}
              </PageLink>
            </nav>
          )}
        </>
      ) : (
        <section className="border-y border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <CalendarClock className="mx-auto size-8 text-emerald-700" />
          <h2 className="mt-4 font-semibold">{copy.noShipments}</h2>
          <p className="mt-1 text-sm text-zinc-500">{copy.noShipmentsHint}</p>
        </section>
      )}
    </div>
  );
}

function RequestCell({
  shipment,
  locale,
  copy,
}: {
  shipment: PlannedShipmentDto;
  locale: PartnerLocale;
  copy: ReturnType<typeof projectCopy>;
}) {
  const request = shipment.dateChangeRequest;
  if (
    !request ||
    request.status === "cancelled" ||
    request.status === "rejected"
  )
    return (
      <div className="space-y-2">
        {request && (
          <p className="text-xs text-zinc-500">
            {dateRequestStatusLabel(locale, request.status)}
          </p>
        )}
        <OrderDateChangeDialog
          currentDate={shipment.deliveryDate!}
          orderHistoryId={shipment.id}
        />
      </div>
    );
  return (
    <div className="space-y-1 text-sm">
      <p className="font-semibold">
        {dateRequestStatusLabel(locale, request.status)}
      </p>
      <p className="text-xs text-zinc-500">
        {copy.currentDate}: {formatPartnerDate(shipment.deliveryDate!, locale)}
      </p>
      <p className="text-xs text-zinc-500">
        {copy.requestedDate}: {formatPartnerDate(request.requestedDate, locale)}
      </p>
      {request.reviewComment ? (
        <p className="text-xs text-zinc-600">
          {copy.novotechComment}: {request.reviewComment}
        </p>
      ) : null}
      {request.status === "pending" ? (
        <p className="text-xs text-zinc-500">{copy.pendingDecision}</p>
      ) : null}
      {request.awaitingOneC && (
        <p className="text-xs text-amber-700">{copy.awaitingOneC}</p>
      )}
      {request.status === "pending" && (
        <CancelOrderDateChangeButton requestId={request.id} />
      )}
    </div>
  );
}
function PageLink({
  disabled,
  page,
  children,
}: {
  disabled: boolean;
  page: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      aria-disabled={disabled}
      className={
        disabled
          ? "pointer-events-none text-zinc-300"
          : "font-semibold text-emerald-700"
      }
      href={`/cabinet/reservation-requests?page=${Math.max(1, page)}`}
      prefetch={false}
    >
      {children}
    </Link>
  );
}
function indicatorTone(value: PlannedShipmentIndicator) {
  return value === "overdue"
    ? "bg-red-100 text-red-800"
    : value === "today"
      ? "bg-amber-100 text-amber-900"
      : value === "soon"
        ? "bg-blue-100 text-blue-800"
        : "bg-emerald-100 text-emerald-800";
}
