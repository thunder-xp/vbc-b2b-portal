import {
  AlertTriangle,
  Building2,
  CircleDollarSign,
  Link2,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import type { AdminCompanyOverview as AdminCompanyOverviewModel } from "../types";

export function AdminCompanyOverviewView({
  company,
}: {
  company: AdminCompanyOverviewModel;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section icon={Building2} title="Компания">
        <Definition label="Название" value={company.displayName} />
        <Definition
          label="Фискальный код"
          value={company.fiscalCode ?? "Не указан"}
        />
        <Definition label="Статус доступа" value={company.companyStatus} />
        <Definition
          label="Активный владелец"
          value={company.activeOwnerName ?? "Не назначен"}
        />
      </Section>
      <Section icon={Users} title="Доступ">
        <Definition
          label="Активные пользователи"
          value={String(company.activeMembershipCount)}
        />
        <Definition
          label="Активные владельцы"
          value={String(company.activeOwnerCount)}
        />
        <Definition
          label="Ожидающие приглашения"
          value={String(company.pendingInvitationCount)}
        />
        <Definition
          label="Последнее событие"
          value={
            company.latestAccessEventAt
              ? `${company.latestAccessEventType ?? "Изменение"} · ${formatDate(company.latestAccessEventAt)}`
              : "Событий нет"
          }
        />
      </Section>
      <Section icon={Link2} title="Сопоставление с 1С">
        <Definition
          label="Контрагент"
          value={company.external1cId ?? "Не сопоставлен"}
          mono
        />
        <Definition
          label="Код контрагента"
          value={company.external1cCode ?? "Не указан"}
        />
        <Definition
          label="Договор"
          value={company.external1cContractId ?? "Не сопоставлен"}
          mono
        />
        <Definition
          label="Организация"
          value="Управляется платформенной конфигурацией"
        />
      </Section>
      <Section icon={CircleDollarSign} title="Коммерческий контекст">
        <Definition
          label="Статус партнёра"
          value={company.partnerPriceType ?? "Не назначен"}
        />
        <Definition
          label="Ссылка вида цены"
          value={company.external1cPriceTypeId ?? "Не сопоставлена"}
          mono
        />
        <Definition
          label="Финансовая синхронизация"
          value={company.financeSyncState}
        />
        <Definition
          label="Последнее успешное обновление"
          value={
            company.financeLastSuccessAt
              ? formatDate(company.financeLastSuccessAt)
              : "Нет данных"
          }
        />
      </Section>
      {company.warningCodes.length ? (
        <section className="flex gap-3 border border-amber-200 bg-amber-50 p-4 text-amber-950 lg:col-span-2">
          <AlertTriangle
            aria-hidden
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <div>
            <h2 className="font-semibold">Требуется внимание</h2>
            <p className="mt-1 text-sm">
              {company.warningCodes.map(warningLabel).join(" · ")}
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Section({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: typeof Building2;
  title: string;
}) {
  return (
    <section className="border border-zinc-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon aria-hidden className="h-5 w-5 text-emerald-700" />
        {title}
      </h2>
      <dl className="mt-4 divide-y divide-zinc-100">{children}</dl>
    </section>
  );
}

function Definition({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd
        className={`min-w-0 break-words text-sm font-medium ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function warningLabel(code: string): string {
  return (
    {
      missing_1c_mapping: "Нет связи с контрагентом 1С",
      no_active_owner: "Нет активного владельца",
      finance_sync_failed: "Ошибка финансовой синхронизации",
      missing_price_type: "Не назначен статус партнёра",
    }[code] ?? "Состояние требует проверки"
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
