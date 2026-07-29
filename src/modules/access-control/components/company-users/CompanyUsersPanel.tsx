import {
  appointCompanyOwnerAction,
  restoreCompanyEmployeeAction,
  revokeEmployeeInvitationAction,
  suspendCompanyEmployeeAction,
  transferCompanyOwnerAction,
  updateCompanyEmployeeAccessAction,
} from "../../actions/company-users.actions";
import type { CompanyUserEvent, CompanyUserPage } from "../../types";
import { formatBusinessDateTime, getPartnerRoleDescription, getPartnerRoleLabel } from "../../../platform-ui";
import { InvitationActions } from "./InvitationActions";
import { InvitationForm } from "./InvitationForm";

export function CompanyUsersPanel({
  companyId,
  companyName,
  events,
  isAdmin,
  page,
  showAudit = true,
}: {
  companyId: string;
  companyName: string;
  events: CompanyUserEvent[];
  isAdmin: boolean;
  page: CompanyUserPage;
  showAudit?: boolean;
}) {
  const adminCompanyId = isAdmin ? companyId : undefined;
  const currentOwnerMembershipId = page.records.find(
    (record) =>
      record.recordType === "membership" &&
      record.roleCode === "partner_owner" &&
      record.membershipStatus === "active",
  )?.recordId;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase text-emerald-700">
          {isAdmin ? "Администрирование компании" : "Моя компания"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Сотрудники и доступ</h1>
        <p className="mt-2 text-sm text-zinc-600">{companyName}. Управление ролями и доступом без передачи паролей.</p>
      </header>
      <InvitationForm companyId={adminCompanyId} />
      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="font-semibold text-zinc-950">Сотрудники и приглашения</h2>
          <p className="text-sm text-zinc-500">Всего: {page.totalCount}</p>
        </div>
        <div className="divide-y divide-zinc-200">
          {page.records.length ? page.records.map((record) => (
            <article className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr_1fr_1.5fr]" key={`${record.recordType}:${record.recordId}`}>
              <div className="min-w-0">
                <p className="truncate font-semibold text-zinc-950">{record.fullName}</p>
                <p className="truncate text-sm text-zinc-500">{record.email}</p>
                <p className="mt-1 text-xs text-zinc-500">{statusLabel(record.membershipStatus ?? record.invitationStatus)}</p>
              </div>
              <div className="text-sm">
                <p className="text-xs font-medium uppercase text-zinc-500">Роль</p>
                <p className="mt-1 font-medium text-zinc-900">{getPartnerRoleLabel(record.roleCode)}</p>
                <p className="mt-1 text-xs text-zinc-500">{getPartnerRoleDescription(record.roleCode)}</p>
              </div>
              <div className="text-sm">
                <p className="text-xs font-medium uppercase text-zinc-500">Цены</p>
                <p className="mt-1 text-zinc-900">{record.priceAccess === "retail_only" ? "Только розничные цены" : "Полный доступ к коммерческим ценам"}</p>
              </div>
              <div className="min-w-0">
                {record.recordType === "invitation" ? (
                  <div className="flex flex-wrap gap-4">
                    {record.invitationStatus === "pending" ? <InvitationActions companyId={adminCompanyId} invitationId={record.recordId} /> : null}
                    {record.invitationStatus === "pending" ? (
                      <form action={revokeEmployeeInvitationAction}>
                        <HiddenScope companyId={adminCompanyId} name="invitationId" value={record.recordId} />
                        <ReasonField />
                        <button className="min-h-11 text-xs font-semibold text-red-700">Отозвать</button>
                      </form>
                    ) : null}
                  </div>
                ) : (
                  <MembershipActions
                    companyId={adminCompanyId}
                    currentOwnerMembershipId={currentOwnerMembershipId}
                    record={record}
                  />
                )}
              </div>
            </article>
          )) : <p className="p-8 text-center text-sm text-zinc-500">Сотрудников и приглашений пока нет.</p>}
        </div>
      </section>
      {isAdmin && showAudit ? <AuditTrail events={events} /> : null}
    </div>
  );
}

function MembershipActions({
  companyId,
  currentOwnerMembershipId,
  record,
}: {
  companyId?: string;
  currentOwnerMembershipId?: string;
  record: CompanyUserPage["records"][number];
}) {
  return (
    <div className="grid gap-3">
      <form action={updateCompanyEmployeeAccessAction} className="grid gap-2 sm:grid-cols-2">
        <HiddenScope companyId={companyId} name="membershipId" value={record.recordId} />
        <p className="text-xs leading-5 text-zinc-600 sm:col-span-2">Изменение роли меняет доступ сотрудника к заказам, финансам и управлению компанией.</p>
        <select aria-label="Роль сотрудника" className="h-11 rounded border border-zinc-300 bg-white px-2 text-xs" defaultValue={record.roleCode} name="roleCode">
          {record.roleCode === "partner_owner" ? <option value="partner_owner">Владелец</option> : null}
          <option value="partner_manager">Менеджер</option>
          <option value="partner_buyer">Покупатель</option>
          <option value="partner_accounting">Бухгалтер</option>
          <option value="partner_viewer">Наблюдатель</option>
        </select>
        <select aria-label="Доступ к ценам" className="h-11 rounded border border-zinc-300 bg-white px-2 text-xs" defaultValue={record.priceAccess} name="priceAccess">
          <option value="full">Полный доступ к коммерческим ценам</option>
          <option value="retail_only">Только розничные цены</option>
        </select>
        <ReasonField />
        <button className="min-h-11 justify-self-start text-xs font-semibold text-emerald-700">Подтвердить изменение доступа</button>
      </form>
      <div className="flex flex-wrap gap-4">
        <form action={record.membershipStatus === "suspended" ? restoreCompanyEmployeeAction : suspendCompanyEmployeeAction}>
          <HiddenScope companyId={companyId} name="membershipId" value={record.recordId} />
          <ReasonField />
          <button className="min-h-11 text-xs font-semibold text-zinc-700">
            {record.membershipStatus === "suspended" ? "Восстановить" : "Приостановить"}
          </button>
        </form>
        {record.roleCode !== "partner_owner" && record.membershipStatus === "active" ? (
          <form action={currentOwnerMembershipId ? transferCompanyOwnerAction : appointCompanyOwnerAction}>
            <HiddenScope companyId={companyId} name="membershipId" value={record.recordId} />
            {currentOwnerMembershipId ? (
              <>
                <input name="currentOwnerMembershipId" type="hidden" value={currentOwnerMembershipId} />
                <input name="nextOwnerMembershipId" type="hidden" value={record.recordId} />
              </>
            ) : null}
            <ReasonField />
            <button className="min-h-11 text-xs font-semibold text-amber-700">
              {currentOwnerMembershipId ? "Передать владение" : "Назначить владельцем"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function ReasonField() {
  return (
    <input
      aria-label="Причина изменения"
      className="h-11 min-w-0 rounded border border-zinc-300 px-2 text-xs"
      maxLength={500}
      minLength={3}
      name="reason"
      placeholder="Причина изменения"
      required
    />
  );
}

function HiddenScope({ companyId, name, value }: { companyId?: string; name: string; value: string }) {
  return (
    <>
      {companyId ? <input name="companyId" type="hidden" value={companyId} /> : null}
      <input name={name} type="hidden" value={value} />
    </>
  );
}

function AuditTrail({ events }: { events: CompanyUserEvent[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-zinc-950">Журнал доступа</h2>
      <div className="mt-4 divide-y divide-zinc-100">
        {events.map((event) => (
          <div className="flex justify-between gap-4 py-3 text-sm" key={event.id}>
            <span>{eventLabel(event.eventType)}</span>
            <time className="shrink-0 text-zinc-500">{formatBusinessDateTime(event.createdAt)}</time>
          </div>
        ))}
        {!events.length ? <p className="py-4 text-sm text-zinc-500">Событий пока нет.</p> : null}
      </div>
    </section>
  );
}

function statusLabel(status: string | null): string {
  return {
    active: "Активен",
    suspended: "Приостановлен",
    pending: "Приглашён",
    expired: "Срок приглашения истёк",
    revoked: "Отозвано",
  }[status ?? ""] ?? "Статус уточняется";
}

function eventLabel(type: string): string {
  return {
    invitation_created: "Приглашение создано",
    invitation_resent: "Ссылка приглашения обновлена",
    invitation_revoked: "Приглашение отозвано",
    invitation_accepted: "Приглашение принято",
    employee_suspended: "Доступ сотрудника приостановлен",
    employee_restored: "Доступ сотрудника восстановлен",
    role_changed: "Роль сотрудника изменена",
    price_access_changed: "Доступ к ценам изменён",
    owner_appointed: "Назначен владелец компании",
    owner_transferred: "Владение компанией передано",
  }[type] ?? "Изменение доступа";
}
