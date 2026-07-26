import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminCompanyOverviewView,
  AdminPageHeader,
  createAdminCompanyService,
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
  await requireAdminPagePermission("admin.companies.view");
  const [{ companyId }, query] = await Promise.all([params, searchParams]);
  const company = await createAdminCompanyService().getOverview(companyId);
  if (!company) notFound();
  const requestedTab = first(query.tab);
  const tab = TABS.some(([value]) => value === requestedTab)
    ? requestedTab
    : "overview";

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
        {TABS.map(([value, label]) => (
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
