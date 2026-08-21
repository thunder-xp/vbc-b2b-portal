import { Bell, ExternalLink } from "lucide-react";
import Link from "next/link";

import { listNotificationsAction } from "@/src/modules/notifications/actions";
import {
  MarkAllNotificationsReadButton,
  NotificationActions,
  NotificationSeverityLabel,
  ProductNotificationLink,
} from "@/src/modules/notifications/components";
import type { NotificationEventGroup, NotificationListFilter } from "@/src/modules/notifications";
import { notificationCopy, presentPartnerNotification } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const filterValues = ["all", "orders", "shipments", "company_access", "products", "unread"] as const;

export default async function CabinetNotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, locale] = await Promise.all([searchParams, getPartnerLocale()]);
  const copy = notificationCopy(locale);
  const filters = [
    { value: "all", label: copy.filterAll },
    { value: "orders", label: copy.filterOrders },
    { value: "shipments", label: copy.filterShipments },
    { value: "company_access", label: copy.filterAccess },
    { value: "products", label: copy.filterProducts },
    { value: "unread", label: copy.filterUnread },
  ] as const;
  const selected = parseFilter(single(params.filter));
  const cursorAt = single(params.cursorAt);
  const cursorId = single(params.cursorId);
  const query: NotificationListFilter = {
    eventGroup: isEventGroup(selected) ? selected : undefined,
    unreadOnly: selected === "unread",
    cursor: cursorAt && cursorId ? { occurredAt: cursorAt, id: cursorId } : undefined,
    pageSize: 20,
  };
  const result = await listNotificationsAction(query);
  const items = result.success ? result.data.items.map((item) => presentPartnerNotification(item, locale)) : [];

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-emerald-700">{copy.workspace}</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-950">{copy.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">{copy.intro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50" href="/cabinet/notifications/settings" prefetch={false}>{copy.settings}</Link>
          <MarkAllNotificationsReadButton disabled={!result.success || !items.some((item) => !item.readAt)} />
        </div>
      </header>

      <nav aria-label={copy.filters} className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((filter) => (
          <Link
            aria-current={selected === filter.value ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-md border px-4 text-sm font-medium ${selected === filter.value ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}
            href={`/cabinet/notifications?filter=${filter.value}`}
            key={filter.value}
            prefetch={false}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {!result.success ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{copy.loadError}</div>
      ) : items.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 bg-white px-6 text-center">
          <Bell aria-hidden="true" className="text-zinc-400" size={28} />
          <h2 className="mt-3 text-base font-semibold text-zinc-950">{copy.emptyTitle}</h2>
          <p className="mt-1 max-w-md text-sm text-zinc-600">{copy.emptyMessage}</p>
          <Link className="mt-4 text-sm font-medium text-emerald-700" href="/cabinet">{copy.backWorkspace}</Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <article className={`rounded-md border bg-white p-4 sm:p-5 ${item.readAt ? "border-zinc-200" : "border-emerald-300"}`}>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <NotificationSeverityLabel severity={item.severity} />
                        {!item.readAt && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">{copy.unread}</span>}
                      </div>
                      <h2 className="mt-2 text-base font-semibold text-zinc-950">{item.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-zinc-600">{item.message}</p>
                    </div>
                    <time className="shrink-0 text-xs text-zinc-500" dateTime={item.occurredAt}>{item.relativeTime}</time>
                  </div>
                  <div className="mt-4 flex flex-col justify-between gap-3 border-t border-zinc-100 pt-3 sm:flex-row sm:items-center">
                    <NotificationActions dismissible={!item.mandatory && item.severity !== "critical"} notificationId={item.id} read={Boolean(item.readAt)} />
                    {item.actionUrl && item.actionLabel && (item.eventGroup === "products" ? (
                      <ProductNotificationLink actionUrl={item.actionUrl} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-emerald-700 hover:text-emerald-900 sm:self-auto">
                        {item.actionLabel}<ExternalLink aria-hidden="true" size={15} />
                      </ProductNotificationLink>
                    ) : (
                      <Link className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-emerald-700 hover:text-emerald-900 sm:self-auto" href={item.actionUrl} prefetch={false}>
                        {item.actionLabel}<ExternalLink aria-hidden="true" size={15} />
                      </Link>
                    ))}
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {result.data.nextCursor && <Link className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50" href={nextPageUrl(selected, result.data.nextCursor)} prefetch={false}>{copy.showMore}</Link>}
        </>
      )}
    </section>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseFilter(value: string | undefined): typeof filterValues[number] {
  return filterValues.includes(value as typeof filterValues[number]) ? value as typeof filterValues[number] : "all";
}

function isEventGroup(value: string): value is NotificationEventGroup {
  return value === "orders" || value === "shipments" || value === "company_access" || value === "products";
}

function nextPageUrl(filter: string, cursor: { occurredAt: string; id: string }): string {
  const params = new URLSearchParams({ filter, cursorAt: cursor.occurredAt, cursorId: cursor.id });
  return `/cabinet/notifications?${params.toString()}`;
}
