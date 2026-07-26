import Link from "next/link";

import { InvitationActions } from "@/src/modules/access-control/components/company-users";

import type {
  AdminInvitationFilter,
  AdminInvitationPage,
} from "../types";
import { AdminPageHeader } from "./AdminPageHeader";

const FILTER_LABELS: Record<AdminInvitationFilter, string> = {
  all: "Все приглашения",
  pending: "Ожидают",
  accepted: "Приняты",
  expired: "Истекли",
  revoked: "Отозваны",
};

export function AdminInvitationDirectory({
  canManage,
  invitations,
}: {
  canManage: boolean;
  invitations: AdminInvitationPage;
}) {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Состояние приглашений без сохранённых или отображаемых одноразовых токенов."
        eyebrow="Доступ"
        title="Приглашения"
      />
      <form className="grid gap-3 border border-zinc-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_15rem_auto]">
        <label className="grid gap-1 text-sm font-medium">
          Поиск
          <input
            className="h-10 min-w-0 border border-zinc-300 px-3"
            defaultValue={invitations.search}
            maxLength={100}
            name="search"
            placeholder="Компания, имя или email"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Состояние
          <select
            className="h-10 border border-zinc-300 bg-white px-3"
            defaultValue={invitations.filter}
            name="filter"
          >
            {Object.entries(FILTER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="h-10 self-end bg-zinc-950 px-4 text-sm font-semibold text-white">
          Применить
        </button>
      </form>

      <section className="overflow-hidden border border-zinc-200 bg-white">
        <div className="flex justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="font-semibold">Приглашения</h2>
          <span className="text-sm text-zinc-500">
            {invitations.totalCount}
          </span>
        </div>
        {invitations.records.length ? (
          <div className="divide-y divide-zinc-100">
            {invitations.records.map((invitation) => (
              <article
                className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(14rem,1.3fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]"
                key={invitation.invitationId}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {invitation.fullName}
                  </p>
                  <p className="truncate text-sm text-zinc-500">
                    {invitation.email}
                  </p>
                  <Link
                    className="mt-1 inline-flex text-xs font-semibold text-emerald-700"
                    href={`/admin/companies/${invitation.companyId}?tab=users`}
                    prefetch={false}
                  >
                    {invitation.companyName}
                  </Link>
                </div>
                <Field label="Роль" value={invitation.roleName} />
                <Field
                  label="Доступ к ценам"
                  value={
                    invitation.priceAccess === "retail_only"
                      ? "Только розничные"
                      : "Партнёрские и розничные"
                  }
                />
                <div>
                  <Field
                    label="Состояние"
                    value={statusLabel(invitation.invitationStatus)}
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    Повторных отправок: {invitation.resendCount}
                  </p>
                  {canManage && invitation.invitationStatus === "pending" ? (
                    <div className="mt-2">
                      <InvitationActions
                        companyId={invitation.companyId}
                        invitationId={invitation.invitationId}
                      />
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">
            Приглашения не найдены.
          </p>
        )}
      </section>
      <Pagination page={invitations} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function Pagination({ page }: { page: AdminInvitationPage }) {
  if (page.totalPages <= 1) return null;
  const href = (target: number) => {
    const query = new URLSearchParams({
      page: String(target),
      filter: page.filter,
    });
    if (page.search) query.set("search", page.search);
    return `/admin/invitations?${query}`;
  };
  return (
    <nav aria-label="Страницы приглашений" className="flex justify-between text-sm">
      {page.page > 1 ? (
        <Link className="font-semibold text-emerald-700" href={href(page.page - 1)}>
          Назад
        </Link>
      ) : (
        <span />
      )}
      <span className="text-zinc-600">
        {page.page} из {page.totalPages}
      </span>
      {page.page < page.totalPages ? (
        <Link className="font-semibold text-emerald-700" href={href(page.page + 1)}>
          Далее
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function statusLabel(status: string): string {
  return (
    {
      pending: "Ожидает",
      accepted: "Принято",
      expired: "Истекло",
      revoked: "Отозвано",
    }[status] ?? "Состояние уточняется"
  );
}
