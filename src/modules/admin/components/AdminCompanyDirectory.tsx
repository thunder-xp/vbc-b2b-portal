import {
  AlertTriangle,
  Building2,
  CircleDollarSign,
  Link2,
  Users,
} from "lucide-react";
import Link from "next/link";

import type { AdminCompanyFilter, AdminCompanyPage } from "../types";
import { AdminPageHeader } from "./AdminPageHeader";

const FILTER_LABELS: Record<AdminCompanyFilter, string> = {
  all: "Все компании",
  active: "Активные",
  pending_access: "Ожидают доступа",
  missing_1c_mapping: "Без связи с 1С",
  no_active_owner: "Без активного владельца",
  suspended: "Приостановленные",
  finance_sync_failed: "Ошибка финансов",
  commercial_data_stale: "Устаревшие коммерческие данные",
};

export function AdminCompanyDirectory({
  companies,
}: {
  companies: AdminCompanyPage;
}) {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Компании, доступ партнёров и состояние коммерческих read-моделей без загрузки данных из 1С."
        eyebrow="Партнёры"
        title="Компании"
      />

      <form className="grid gap-3 border border-zinc-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_15rem_auto]">
        <label className="grid gap-1 text-sm font-medium">
          Поиск
          <input
            className="h-10 min-w-0 border border-zinc-300 px-3"
            defaultValue={companies.search}
            maxLength={100}
            name="search"
            placeholder="Название, фискальный код или ссылка 1С"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Состояние
          <select
            className="h-10 border border-zinc-300 bg-white px-3"
            defaultValue={companies.filter}
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
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="font-semibold">Результаты</h2>
          <span className="text-sm text-zinc-500">{companies.totalCount}</span>
        </div>
        {companies.records.length ? (
          <div className="divide-y divide-zinc-100">
            {companies.records.map((company) => (
              <CompanyRow company={company} key={company.companyId} />
            ))}
          </div>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">
            Компании по выбранным условиям не найдены.
          </p>
        )}
      </section>

      <Pagination page={companies} />
    </div>
  );
}

function CompanyRow({
  company,
}: {
  company: AdminCompanyPage["records"][number];
}) {
  return (
    <article className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(15rem,1.4fr)_repeat(4,minmax(8rem,0.7fr))]">
      <div className="min-w-0">
        <Link
          className="font-semibold text-zinc-950 hover:text-emerald-700"
          href={`/admin/companies/${company.companyId}`}
          prefetch={false}
        >
          {company.displayName}
        </Link>
        <p className="mt-1 truncate text-xs text-zinc-500">
          {company.fiscalCode ?? "Фискальный код не указан"}
        </p>
        <p className="mt-2 text-xs font-medium text-zinc-700">
          {statusLabel(company.companyStatus)}
        </p>
      </div>
      <Metric
        icon={Users}
        label="Активные / владельцы"
        value={`${company.activeMembershipCount} / ${company.activeOwnerCount}`}
      />
      <Metric
        icon={Link2}
        label="Связь с 1С"
        value={
          company.counterpartyMappingState === "mapped"
            ? "Настроена"
            : "Отсутствует"
        }
      />
      <Metric
        icon={CircleDollarSign}
        label="Статус партнёра"
        value={company.partnerPriceType ?? "Не назначен"}
      />
      <div>
        <p className="text-xs text-zinc-500">Финансы / данные</p>
        <p className="mt-1 text-sm font-medium">
          {financeLabel(company.financeSyncState)} ·{" "}
          {commercialLabel(company.commercialState)}
        </p>
        {company.warningCodes.length ? (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-700">
            <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
            Предупреждений: {company.warningCodes.length}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-zinc-500">
        <Icon aria-hidden className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function Pagination({ page }: { page: AdminCompanyPage }) {
  if (page.totalPages <= 1) return null;
  return (
    <nav
      aria-label="Страницы компаний"
      className="flex items-center justify-between text-sm"
    >
      <PageLink disabled={page.page <= 1} page={page} target={page.page - 1}>
        Назад
      </PageLink>
      <span className="text-zinc-600">
        {page.page} из {page.totalPages}
      </span>
      <PageLink
        disabled={page.page >= page.totalPages}
        page={page}
        target={page.page + 1}
      >
        Далее
      </PageLink>
    </nav>
  );
}

function PageLink({
  children,
  disabled,
  page,
  target,
}: {
  children: string;
  disabled: boolean;
  page: AdminCompanyPage;
  target: number;
}) {
  if (disabled) return <span className="text-zinc-400">{children}</span>;
  const query = new URLSearchParams({
    page: String(target),
    filter: page.filter,
  });
  if (page.search) query.set("search", page.search);
  return (
    <Link
      className="font-semibold text-emerald-700"
      href={`/admin/companies?${query}`}
    >
      {children}
    </Link>
  );
}

function statusLabel(status: string): string {
  return (
    {
      active: "Активна",
      pending_approval: "Ожидает активации",
      suspended: "Приостановлена",
      revoked: "Доступ отозван",
      rejected: "Отклонена",
    }[status] ?? "Статус уточняется"
  );
}

function financeLabel(status: string): string {
  return (
    {
      succeeded: "Финансы актуальны",
      running: "Финансы обновляются",
      failed: "Ошибка финансов",
      mapping_missing: "Нет сопоставления",
      never_run: "Финансы не загружены",
    }[status] ?? "Финансы уточняются"
  );
}

function commercialLabel(status: string): string {
  return (
    {
      current: "данные актуальны",
      stale: "данные устарели",
      unavailable: "данных нет",
    }[status] ?? "состояние уточняется"
  );
}
