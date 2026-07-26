import Link from "next/link";
import { notFound } from "next/navigation";

import { getCompanyUsersAction } from "@/src/modules/access-control/actions/company-users.actions";
import { CompanyUsersPanel } from "@/src/modules/access-control/components/company-users";
import {
  AdminCompanyOverviewView,
  AdminCompanyAccessSubjects,
  AdminHistory,
  AdminPageHeader,
  createAdminCompanyService,
  createAdminHistoryService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

const TABS = [
  ["overview", "Обзор"],
  ["users", "Пользователи"],
  ["access", "Доступ"],
  ["history", "История"],
] as const;

export default async function AdminCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireAdminPagePermission("admin.companies.view");
  const [{ companyId }, query] = await Promise.all([params, searchParams]);
  const company = await createAdminCompanyService().getOverview(companyId);
  if (!company) notFound();
  const tabs = context.permissions.includes("admin.audit.view")
    ? TABS
    : TABS.filter(([value]) => value !== "history");
  const requestedTab = first(query.tab);
  const tab = tabs.some(([value]) => value === requestedTab)
    ? requestedTab
    : "overview";
  const companyUsers =
    tab === "users" || tab === "access"
      ? await getCompanyUsersAction({
          companyId,
          page: numberValue(first(query.page)),
          includeEvents: false,
        })
      : null;
  const history = tab === "history"
    ? await createAdminHistoryService().listCompany(
        companyId,
        first(query.page),
      )
    : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Идентификация, доступ и состояние read-моделей компании."
        eyebrow="Компания"
        title={company.displayName}
      />
      <nav
        aria-label="Разделы компании"
        className="flex gap-1 overflow-x-auto border-b border-zinc-200"
      >
        {tabs.map(([value, label]) => (
          <Link
            aria-current={tab === value ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${
              tab === value
                ? "border-emerald-700 text-emerald-800"
                : "border-transparent text-zinc-600"
            }`}
            href={`/admin/companies/${companyId}?tab=${value}`}
            key={value}
            prefetch={false}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "overview" ? (
        <AdminCompanyOverviewView company={company} />
      ) : tab === "users" && companyUsers?.success ? (
        <CompanyUsersPanel
          companyId={companyUsers.data.company.id}
          companyName={companyUsers.data.company.displayName}
          events={[]}
          isAdmin
          page={companyUsers.data.users}
          showAudit={false}
        />
      ) : tab === "access" && companyUsers?.success ? (
        <AdminCompanyAccessSubjects
          companyId={companyId}
          users={companyUsers.data.users}
        />
      ) : tab === "history" && history ? (
        <AdminHistory
          baseHref={`/admin/companies/${encodeURIComponent(companyId)}?tab=history`}
          history={history}
        />
      ) : (
        <section className="border border-zinc-200 bg-white p-8 text-sm text-zinc-600">
          Этот раздел загружается отдельно и будет подключён в текущем Slice 2.
        </section>
      )}
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function numberValue(value: string | undefined): number {
  const result = Number(value);
  return Number.isInteger(result) && result > 0 ? result : 1;
}
