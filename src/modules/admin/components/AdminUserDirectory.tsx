import { ShieldCheck, UserRound, Users } from "lucide-react";
import Link from "next/link";

import {
  assignInternalRoleAction,
  revokeInternalRoleAction,
} from "../actions";
import { ASSIGNABLE_INTERNAL_ROLES } from "../services";
import type { AdminUserFilter, AdminUserPage } from "../types";
import { AdminPageHeader } from "./AdminPageHeader";

const FILTER_LABELS: Record<AdminUserFilter, string> = {
  all: "Все пользователи",
  internal: "Внутренние",
  partner: "Партнёры",
  active: "Активные",
  suspended: "Приостановленные",
  invited: "Приглашённые",
  retail_only: "Только розничные цены",
  owner: "Владельцы компаний",
  no_role_assignment: "Без назначения роли",
};

export function AdminUserDirectory({
  canManageInternalRoles,
  canViewAudit,
  users,
}: {
  canManageInternalRoles: boolean;
  canViewAudit: boolean;
  users: AdminUserPage;
}) {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Партнёрские и внутренние идентичности. Роли платформы и членство компании показаны раздельно."
        eyebrow="Доступ"
        title="Пользователи"
      />
      <form className="grid gap-3 border border-zinc-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_15rem_auto]">
        <label className="grid gap-1 text-sm font-medium">
          Поиск
          <input
            className="h-10 min-w-0 border border-zinc-300 px-3"
            defaultValue={users.search}
            maxLength={100}
            name="search"
            placeholder="Имя, email или компания"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Тип доступа
          <select
            className="h-10 border border-zinc-300 bg-white px-3"
            defaultValue={users.filter}
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
          <h2 className="font-semibold">Идентичности</h2>
          <span className="text-sm text-zinc-500">{users.totalCount}</span>
        </div>
        {users.records.length ? (
          <div className="divide-y divide-zinc-100">
            {users.records.map((user) => (
              <article
                className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(14rem,1.4fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]"
                key={user.recordKey}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{user.fullName}</p>
                  <p className="truncate text-sm text-zinc-500">{user.email}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-700">
                    {user.identityType === "internal" ? (
                      <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-emerald-700" />
                    ) : (
                      <UserRound aria-hidden className="h-3.5 w-3.5" />
                    )}
                    {identityLabel(user.identityType)}
                  </p>
                </div>
                <Field
                  label={user.identityType === "internal" ? "Роль платформы" : "Роль компании"}
                  value={user.roleSummary ?? "Не назначена"}
                />
                <div>
                  <p className="flex items-center gap-1 text-xs text-zinc-500">
                    <Users aria-hidden className="h-3.5 w-3.5" />
                    Компания
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {user.companyNames.join(", ") || "Платформенный контекст"}
                  </p>
                </div>
                <div>
                  <Field
                    label="Состояние"
                    value={statusLabel(
                      user.membershipStatus ?? user.invitationStatus,
                    )}
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    Создан: {formatDate(user.createdAt)}
                  </p>
                  {canManageInternalRoles &&
                  user.identityType === "internal" &&
                  user.userId ? (
                    <InternalRoleActions
                      hasAssignment={Boolean(user.roleSummary)}
                      userId={user.userId}
                    />
                  ) : null}
                  {canViewAudit && user.userId ? (
                    <Link
                      className="mt-3 inline-block text-xs font-semibold text-emerald-700"
                      href={`/admin/users/${encodeURIComponent(user.userId)}/history`}
                    >
                      История доступа
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">
            Пользователи не найдены.
          </p>
        )}
      </section>
      <Pagination page={users} />
    </div>
  );
}

function InternalRoleActions({
  hasAssignment,
  userId,
}: {
  hasAssignment: boolean;
  userId: string;
}) {
  return (
    <div className="mt-3 grid gap-2">
      <form action={assignInternalRoleAction} className="grid gap-2">
        <input name="userId" type="hidden" value={userId} />
        <select
          aria-label="Роль платформы"
          className="h-9 border border-zinc-300 bg-white px-2 text-xs"
          defaultValue=""
          name="roleCode"
          required
        >
          <option disabled value="">
            Выберите роль
          </option>
          {ASSIGNABLE_INTERNAL_ROLES.map((role) => (
            <option key={role} value={role}>
              {internalRoleLabel(role)}
            </option>
          ))}
        </select>
        <ReasonInput />
        <button className="justify-self-start text-xs font-semibold text-emerald-700">
          {hasAssignment ? "Изменить роль" : "Назначить роль"}
        </button>
      </form>
      {hasAssignment ? (
        <form action={revokeInternalRoleAction} className="grid gap-2">
          <input name="userId" type="hidden" value={userId} />
          <ReasonInput />
          <button className="justify-self-start text-xs font-semibold text-red-700">
            Отозвать роль
          </button>
        </form>
      ) : null}
    </div>
  );
}

function ReasonInput() {
  return (
    <input
      aria-label="Причина изменения роли"
      className="h-9 min-w-0 border border-zinc-300 px-2 text-xs"
      maxLength={500}
      minLength={3}
      name="reason"
      placeholder="Причина"
      required
    />
  );
}

function internalRoleLabel(role: (typeof ASSIGNABLE_INTERNAL_ROLES)[number]) {
  return {
    novotech_admin: "Администратор платформы",
    novotech_sales: "Продажи",
    novotech_finance: "Финансы",
    novotech_support: "Поддержка",
    novotech_content_manager: "Контент",
  }[role];
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function Pagination({ page }: { page: AdminUserPage }) {
  if (page.totalPages <= 1) return null;
  const href = (target: number) => {
    const query = new URLSearchParams({
      page: String(target),
      filter: page.filter,
    });
    if (page.search) query.set("search", page.search);
    return `/admin/users?${query}`;
  };
  return (
    <nav aria-label="Страницы пользователей" className="flex justify-between text-sm">
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

function identityLabel(type: AdminUserPage["records"][number]["identityType"]) {
  return {
    internal: "Внутренний пользователь",
    partner: "Партнёр",
    invited: "Приглашённый пользователь",
  }[type];
}

function statusLabel(status: string | null): string {
  return (
    {
      active: "Активен",
      suspended: "Приостановлен",
      pending: "Приглашён",
      expired: "Приглашение истекло",
      revoked: "Доступ отозван",
    }[status ?? ""] ?? "Состояние уточняется"
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
