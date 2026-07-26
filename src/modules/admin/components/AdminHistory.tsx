import Link from "next/link";

import type { AdminHistoryPage } from "../types";

export function AdminHistory({
  baseHref,
  history,
}: {
  baseHref: string;
  history: AdminHistoryPage;
}) {
  return (
    <section className="border border-zinc-200 bg-white">
      <div className="flex justify-between border-b border-zinc-200 px-5 py-4">
        <div>
          <h2 className="font-semibold">История доступа</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Причины и безопасные изменения без токенов и конфиденциальных данных.
          </p>
        </div>
        <span className="text-sm text-zinc-500">{history.totalCount}</span>
      </div>
      {history.records.length ? (
        <div className="divide-y divide-zinc-100">
          {history.records.map((event) => (
            <article className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,2fr)_auto]" key={event.eventKey}>
              <div>
                <p className="text-sm font-semibold">{eventLabel(event.eventType)}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {event.targetName ?? event.companyName ?? "Контекст платформы"}
                </p>
              </div>
              <div className="text-sm text-zinc-700">
                {event.reason ? <p>Причина: {event.reason}</p> : null}
                {event.safeDetail ? <p className="mt-1 text-xs text-zinc-500">{event.safeDetail}</p> : null}
                <p className="mt-1 text-xs text-zinc-500">
                  Исполнитель: {event.actorName ?? "Системная операция"}
                </p>
              </div>
              <time className="text-xs text-zinc-500">{formatDate(event.createdAt)}</time>
            </article>
          ))}
        </div>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-zinc-500">
          Событий пока нет.
        </p>
      )}
      <HistoryPagination baseHref={baseHref} history={history} />
    </section>
  );
}

function HistoryPagination({
  baseHref,
  history,
}: {
  baseHref: string;
  history: AdminHistoryPage;
}) {
  if (history.totalPages <= 1) return null;
  const separator = baseHref.includes("?") ? "&" : "?";
  return (
    <nav aria-label="Страницы истории" className="flex justify-between border-t border-zinc-200 px-5 py-4 text-sm">
      {history.page > 1 ? (
        <Link href={`${baseHref}${separator}page=${history.page - 1}`}>Назад</Link>
      ) : <span />}
      <span>{history.page} из {history.totalPages}</span>
      {history.page < history.totalPages ? (
        <Link href={`${baseHref}${separator}page=${history.page + 1}`}>Далее</Link>
      ) : <span />}
    </nav>
  );
}

function eventLabel(type: string): string {
  return ({
    invitation_created: "Приглашение создано",
    invitation_resent: "Приглашение обновлено",
    invitation_revoked: "Приглашение отозвано",
    invitation_accepted: "Приглашение принято",
    employee_suspended: "Доступ приостановлен",
    employee_restored: "Доступ восстановлен",
    role_changed: "Роль изменена",
    price_access_changed: "Доступ к ценам изменён",
    permission_override_changed: "Разрешение изменено",
    owner_appointed: "Владелец назначен",
    owner_transferred: "Владение передано",
    internal_role_assigned: "Внутренняя роль назначена",
    internal_role_revoked: "Внутренняя роль отозвана",
    access_request_approved: "Заявка на доступ одобрена",
    access_request_rejected: "Заявка на доступ отклонена",
  }[type] ?? "Изменение доступа");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
