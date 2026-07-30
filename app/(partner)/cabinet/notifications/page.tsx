import { Bell, ExternalLink } from "lucide-react";
import Link from "next/link";

import { listNotificationsAction } from "@/src/modules/notifications/actions";
import {
  MarkAllNotificationsReadButton,
  NotificationActions,
  NotificationSeverityLabel,
  ProductNotificationLink,
} from "@/src/modules/notifications/components";
import type {
  NotificationEventGroup,
  NotificationListFilter,
} from "@/src/modules/notifications";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const filters = [
  { value: "all", label: "Все" },
  { value: "orders", label: "Заказы" },
  { value: "shipments", label: "Отгрузки" },
  { value: "company_access", label: "Доступ сотрудников" },
  { value: "products", label: "Товары" },
  { value: "unread", label: "Непрочитанные" },
] as const;

export default async function CabinetNotificationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
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

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-emerald-700">Рабочий кабинет</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-950">Уведомления</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Важные изменения по заказам, отгрузкам и доступу сотрудников.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            href="/cabinet/notifications/settings"
          >
            Настройки
          </Link>
          <MarkAllNotificationsReadButton
            disabled={!result.success || !result.data.items.some((item) => !item.readAt)}
          />
        </div>
      </header>

      <nav aria-label="Фильтры уведомлений" className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((filter) => (
          <Link
            aria-current={selected === filter.value ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-md border px-4 text-sm font-medium ${
              selected === filter.value
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
            href={`/cabinet/notifications?filter=${filter.value}`}
            key={filter.value}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {!result.success ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          Не удалось загрузить уведомления. Обновите страницу.
        </div>
      ) : result.data.items.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 bg-white px-6 text-center">
          <Bell aria-hidden="true" className="text-zinc-400" size={28} />
          <h2 className="mt-3 text-base font-semibold text-zinc-950">Здесь всё спокойно</h2>
          <p className="mt-1 max-w-md text-sm text-zinc-600">
            Новые события по заказам, отгрузкам и доступу сотрудников появятся здесь.
          </p>
          <Link className="mt-4 text-sm font-medium text-emerald-700" href="/cabinet">
            Вернуться в рабочий кабинет
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {result.data.items.map((item) => (
              <li key={item.id}>
                <article className={`rounded-md border bg-white p-4 sm:p-5 ${
                  item.readAt ? "border-zinc-200" : "border-emerald-300"
                }`}>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <NotificationSeverityLabel severity={item.severity} />
                        {!item.readAt && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            Непрочитано
                          </span>
                        )}
                      </div>
                      <h2 className="mt-2 text-base font-semibold text-zinc-950">{item.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-zinc-600">{item.message}</p>
                    </div>
                    <time className="shrink-0 text-xs text-zinc-500" dateTime={item.occurredAt}>
                      {item.relativeTime}
                    </time>
                  </div>
                  <div className="mt-4 flex flex-col justify-between gap-3 border-t border-zinc-100 pt-3 sm:flex-row sm:items-center">
                    <NotificationActions
                      dismissible={!item.mandatory && item.severity !== "critical"}
                      notificationId={item.id}
                      read={Boolean(item.readAt)}
                    />
                    {item.actionUrl && item.actionLabel && (
                      item.eventGroup === "products" ? (
                        <ProductNotificationLink
                          actionUrl={item.actionUrl}
                          className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-emerald-700 hover:text-emerald-900 sm:self-auto"
                        >
                          {item.actionLabel}
                          <ExternalLink aria-hidden="true" size={15} />
                        </ProductNotificationLink>
                      ) : (
                        <Link
                          className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-emerald-700 hover:text-emerald-900 sm:self-auto"
                          href={item.actionUrl}
                        >
                          {item.actionLabel}
                          <ExternalLink aria-hidden="true" size={15} />
                        </Link>
                      )
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {result.data.nextCursor && (
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              href={nextPageUrl(selected, result.data.nextCursor)}
            >
              Показать ещё
            </Link>
          )}
        </>
      )}
    </section>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseFilter(value: string | undefined): typeof filters[number]["value"] {
  return filters.some((item) => item.value === value) ? value as typeof filters[number]["value"] : "all";
}

function isEventGroup(value: string): value is NotificationEventGroup {
  return value === "orders"
    || value === "shipments"
    || value === "company_access"
    || value === "products";
}

function nextPageUrl(
  filter: string,
  cursor: { occurredAt: string; id: string },
): string {
  const params = new URLSearchParams({
    filter,
    cursorAt: cursor.occurredAt,
    cursorId: cursor.id,
  });
  return `/cabinet/notifications?${params.toString()}`;
}
