import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";

import type {
  AdminAccessInspection,
  AdminAccessSubject,
} from "../types";
import { AdminPageHeader } from "./AdminPageHeader";

const CATEGORY_LABELS: Record<string, string> = {
  catalog: "Каталог",
  pricing: "Цены",
  inventory: "Наличие",
  orders: "Корзина и заказы",
  estimates: "Сметы и КП",
  finance: "Финансы",
  purchasing: "Избранное и списки",
  reservations: "Проектная защита",
  documents: "Документы",
  specifications: "Спецификации",
  company_users: "Управление сотрудниками",
  admin: "Администрирование",
  security: "Безопасность",
};

export function AdminAccessInspector({
  inspection,
  search,
  subjects,
}: {
  inspection: AdminAccessInspection | null;
  search: string;
  subjects: AdminAccessSubject[];
}) {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Серверное объяснение фактических разрешений. Проверка не изменяет доступ и не выполняет вход от имени пользователя."
        eyebrow="Безопасность"
        title="Инспектор доступа"
      />
      <form className="flex gap-3 border border-zinc-200 bg-white p-4">
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
          Пользователь или компания
          <input
            className="h-10 min-w-0 border border-zinc-300 px-3"
            defaultValue={search}
            maxLength={100}
            name="search"
            placeholder="Имя, email или компания"
          />
        </label>
        <button className="h-10 self-end bg-zinc-950 px-4 text-sm font-semibold text-white">
          Найти
        </button>
      </form>

      <section className="border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="font-semibold">Контекст проверки</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Для партнёра доступен только контекст реального членства.
          </p>
        </div>
        {subjects.length ? (
          <div className="divide-y divide-zinc-100">
            {subjects.map((subject) => (
              <SubjectRow key={subject.userId} subject={subject} />
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-zinc-500">
            Пользователи не найдены.
          </p>
        )}
      </section>

      {inspection ? <InspectionResult inspection={inspection} /> : null}
    </div>
  );
}

function SubjectRow({ subject }: { subject: AdminAccessSubject }) {
  return (
    <article className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,2fr)]">
      <div className="min-w-0">
        <p className="truncate font-semibold">{subject.fullName}</p>
        <p className="truncate text-sm text-zinc-500">{subject.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {subject.identityType === "internal" ? (
          <ContextLink userId={subject.userId}>Платформа</ContextLink>
        ) : (
          subject.companyContexts.map((context) => (
            <ContextLink
              companyId={context.companyId}
              key={context.companyId}
              userId={subject.userId}
            >
              {`${context.companyName} · ${context.membershipStatus}`}
            </ContextLink>
          ))
        )}
        {subject.identityType === "partner" &&
        subject.companyContexts.length === 0 ? (
          <span className="text-xs text-zinc-500">Нет членства в компании</span>
        ) : null}
      </div>
    </article>
  );
}

function ContextLink({
  children,
  companyId,
  userId,
}: {
  children: string;
  companyId?: string;
  userId: string;
}) {
  const query = new URLSearchParams({ userId });
  if (companyId) query.set("companyId", companyId);
  return (
    <Link
      className="border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:border-emerald-600"
      href={`/admin/access?${query}`}
      prefetch={false}
    >
      {children}
    </Link>
  );
}

function InspectionResult({
  inspection,
}: {
  inspection: AdminAccessInspection;
}) {
  const categories = groupPermissions(inspection.permissions);
  return (
    <section className="space-y-4">
      <div className="border border-zinc-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden className="h-5 w-5 text-emerald-700" />
          <h2 className="font-semibold">{inspection.fullName}</h2>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {inspection.roleName ?? "Роль не назначена"}
          {inspection.companyName ? ` · ${inspection.companyName}` : " · Платформа"}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Профиль: {inspection.profileStatus}
          {inspection.membershipStatus
            ? ` · Членство: ${inspection.membershipStatus}`
            : ""}
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {[...categories.entries()].map(([category, permissions]) => (
          <section
            className="border border-zinc-200 bg-white"
            key={category}
          >
            <h3 className="border-b border-zinc-200 px-4 py-3 font-semibold">
              {CATEGORY_LABELS[category] ?? category}
            </h3>
            <div className="divide-y divide-zinc-100">
              {permissions.map((permission) => (
                <div
                  className="flex items-start gap-3 px-4 py-3"
                  key={permission.code}
                >
                  {permission.allowed ? (
                    <CheckCircle2
                      aria-label="Разрешено"
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
                    />
                  ) : (
                    <XCircle
                      aria-label="Запрещено"
                      className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{permission.label}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {sourceLabel(permission.source)}
                      {permission.delegable ? " · Делегируемое" : ""}
                      {permission.sensitive ? " · Чувствительное" : ""}
                    </p>
                    <details className="mt-1 text-xs text-zinc-500">
                      <summary className="cursor-pointer">Код разрешения</summary>
                      <code>{permission.code}</code>
                    </details>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function groupPermissions(
  permissions: AdminAccessInspection["permissions"],
): Map<string, AdminAccessInspection["permissions"]> {
  const groups = new Map<string, AdminAccessInspection["permissions"]>();
  for (const permission of permissions) {
    groups.set(permission.category, [
      ...(groups.get(permission.category) ?? []),
      permission,
    ]);
  }
  return groups;
}

function sourceLabel(source: string): string {
  return (
    {
      role_grant: "Разрешено ролью",
      membership_allow: "Явно разрешено в членстве",
      membership_deny: "Явно запрещено в членстве",
      internal_role: "Разрешено внутренней ролью",
      inactive_membership: "Членство неактивно",
      inactive_company: "Компания неактивна",
      inactive_profile: "Профиль неактивен",
      no_role_assignment: "Внутренняя роль не назначена",
      not_granted: "Не предоставлено",
    }[source] ?? "Источник не определён"
  );
}
