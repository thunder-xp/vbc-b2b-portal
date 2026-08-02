"use client";

import { useActionState } from "react";

import {
  moveOrAddPartnerMembershipAction,
  repairApprovedOnboardingAction,
  type PartnerIntegrityActionState,
} from "../actions";
import { partitionAdminMemberships } from "../services/admin-membership-projection";
import type { AdminPartnerMembership, AdminPartnerUserIntegrity, PartnerIntegrityTargetCompany } from "../types";

const INITIAL: PartnerIntegrityActionState = { status: "idle", message: "", correlationId: null };

export function AdminPartnerIntegrityDetail({
  detail,
  targetCompanies,
  genericOperationKey,
  requestOperationKeys,
}: {
  detail: AdminPartnerUserIntegrity;
  targetCompanies: PartnerIntegrityTargetCompany[];
  genericOperationKey: string;
  requestOperationKeys: Record<string, string>;
}) {
  const memberships = partitionAdminMemberships(detail.memberships);
  const activeMembership = memberships.active[0] ?? null;
  return (
    <div className="space-y-6">
      <header className="border-b border-zinc-200 pb-5">
        <p className="text-xs font-semibold uppercase text-emerald-700">Партнёрская идентичность</p>
        <h1 className="mt-2 text-2xl font-semibold">{detail.identity.fullName ?? detail.identity.email}</h1>
        <p className="mt-1 text-sm text-zinc-600">{detail.identity.email}</p>
      </header>

      <Section title="Идентичность">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label="Тип" value={detail.identity.userType} />
          <Field label="Состояние" value={detail.identity.status} />
          <Field label="Профиль" value={detail.identity.id} mono />
        </dl>
      </Section>

      <Section title="Активные членства">
        <div className="divide-y divide-zinc-200">
          {memberships.active.map((membership) => (
            <div className="grid gap-3 py-4 md:grid-cols-[1fr_12rem_10rem]" key={membership.id}>
              <div>
                <p className="font-semibold">{membership.companyName}</p>
                <p className="text-xs text-zinc-500">{membership.companyId}</p>
              </div>
              <Field label="Роль" value={membership.roleCode} />
              <Field label="Состояние" value={`${membership.status}${membership.isDefault ? " · по умолчанию" : ""}`} />
            </div>
          ))}
        </div>
        {!memberships.active.length ? <p className="text-sm text-zinc-500">Активных членств нет.</p> : null}
        {activeMembership && targetCompanies.some((company) => company.companyId !== activeMembership.companyId) ? (
          <MembershipMutationForm
            detail={detail}
            operationKey={genericOperationKey}
            source={activeMembership}
            targets={targetCompanies.filter((company) => company.companyId !== activeMembership.companyId)}
          />
        ) : null}
      </Section>

      <Section title="История членств">
        {memberships.history.length ? (
          <div className="divide-y divide-zinc-200">
            {memberships.history.map((membership) => (
              <div className="grid gap-3 py-4 lg:grid-cols-[1.2fr_10rem_10rem_12rem]" key={membership.id}>
                <div>
                  <p className="font-semibold">{membership.companyName}</p>
                  <p className="text-xs text-zinc-500">{membership.companyId}</p>
                </div>
                <Field label="Роль" value={membership.roleCode} />
                <Field label="Предыдущий статус" value={membership.status} />
                <div className="space-y-2">
                  <Field label="Дата активации" value={membership.approvedAt ?? membership.createdAt} />
                  <Field label="Дата отзыва/изменения" value={membership.endedAt ?? "Не указана"} />
                </div>
                {membership.historyReason ? (
                  <p className="text-sm text-zinc-600 lg:col-span-3">{membership.historyReason}</p>
                ) : null}
                {membership.relatedAuditEvent ? (
                  <p className="break-all font-mono text-xs text-zinc-500">
                    {membership.relatedAuditEvent.operationType} · {membership.relatedAuditEvent.id}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-zinc-500">История членств отсутствует.</p>}
      </Section>

      <Section title="Связанные заявки и диагностика">
        <div className="space-y-4">
          {detail.requests.map((request) => (
            <div className="border-l-4 border-zinc-300 bg-zinc-50 p-4" key={request.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{request.requestedCompanyName ?? "Компания не указана"}</p>
                  <p className="text-sm text-zinc-600">IDNO: {request.requestedFiscalCode ?? "не указан"}</p>
                </div>
                <span className="text-xs font-semibold uppercase text-zinc-700">
                  {request.integrity?.outcome ?? "approval_incomplete"}
                </span>
              </div>
              {request.integrity && request.integrity.outcome !== "consistent" && activeMembership
                && request.integrity.expectedCounterpartyId ? (
                <ApprovedRepairForm
                  counterpartyId={request.integrity.expectedCounterpartyId}
                  operationKey={requestOperationKeys[request.id]!}
                  requestId={request.id}
                  source={activeMembership}
                  userId={detail.identity.id}
                />
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Аудит исправлений">
        {detail.audit.length ? (
          <ol className="divide-y divide-zinc-200">
            {detail.audit.map((event) => (
              <li className="py-3 text-sm" key={event.id}>
                <p className="font-medium">{event.operationType}</p>
                <p className="mt-1 text-zinc-600">{event.reason}</p>
                <p className="mt-1 text-xs text-zinc-500">{event.occurredAt} · {event.correlationId}</p>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-zinc-500">Исправления не выполнялись.</p>}
      </Section>
    </div>
  );
}

function ApprovedRepairForm({ counterpartyId, operationKey, requestId, source, userId }: {
  counterpartyId: string; operationKey: string; requestId: string; source: AdminPartnerMembership; userId: string;
}) {
  const [state, action, pending] = useActionState(repairApprovedOnboardingAction, INITIAL);
  return (
    <form action={action} className="mt-4 grid gap-3 border-t border-zinc-200 pt-4 md:grid-cols-2">
      <HiddenCommon operationKey={operationKey} source={source} userId={userId} />
      <input name="requestId" type="hidden" value={requestId} />
      <input name="counterpartyId" type="hidden" value={counterpartyId} />
      <RepairFields />
      <ActionResult pending={pending} state={state} />
    </form>
  );
}

function MembershipMutationForm({ detail, operationKey, source, targets }: {
  detail: AdminPartnerUserIntegrity; operationKey: string; source: AdminPartnerMembership; targets: PartnerIntegrityTargetCompany[];
}) {
  const [state, action, pending] = useActionState(moveOrAddPartnerMembershipAction, INITIAL);
  return (
    <form action={action} className="mt-5 grid gap-3 border-t border-zinc-200 pt-5 md:grid-cols-2">
      <HiddenCommon operationKey={operationKey} source={source} userId={detail.identity.id} />
      <label className="grid gap-1 text-sm font-medium">Целевая компания
        <select className="h-11 border border-zinc-300 bg-white px-3" name="targetCompanyId" required>
          {targets.map((company) => <option key={company.companyId} value={company.companyId}>{company.displayName}</option>)}
        </select>
      </label>
      <RepairFields />
      <ActionResult pending={pending} state={state} />
    </form>
  );
}

function HiddenCommon({ operationKey, source, userId }: { operationKey: string; source: AdminPartnerMembership; userId: string }) {
  return <>
    <input name="operationKey" type="hidden" value={operationKey} />
    <input name="sourceMembershipId" type="hidden" value={source.id} />
    <input name="sourceVersion" type="hidden" value={source.version} />
    <input name="userId" type="hidden" value={userId} />
  </>;
}

function RepairFields() {
  return <>
    <label className="grid gap-1 text-sm font-medium">Операция
      <select className="h-11 border border-zinc-300 bg-white px-3" defaultValue="move" name="mode">
        <option value="move">Переместить пользователя</option>
        <option value="add">Добавить дополнительную компанию</option>
      </select>
    </label>
    <label className="grid gap-1 text-sm font-medium">Роль
      <select className="h-11 border border-zinc-300 bg-white px-3" defaultValue="partner_owner" name="roleCode">
        <option value="partner_owner">Partner Owner</option>
        <option value="partner_manager">Partner Manager</option>
        <option value="partner_buyer">Partner Buyer</option>
        <option value="partner_accounting">Partner Accounting</option>
        <option value="partner_viewer">Partner Viewer</option>
      </select>
    </label>
    <label className="grid gap-1 text-sm font-medium md:col-span-2">Причина
      <textarea className="min-h-24 border border-zinc-300 p-3" maxLength={2000} minLength={20} name="reason" required />
    </label>
  </>;
}

function ActionResult({ pending, state }: { pending: boolean; state: PartnerIntegrityActionState }) {
  return <div className="flex items-center gap-3 md:col-span-2">
    <button className="min-h-11 bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending}>
      {pending ? "Сохранение..." : "Выполнить контролируемое изменение"}
    </button>
    {state.status !== "idle" ? <p aria-live="polite" className="text-sm text-zinc-700">{state.message}</p> : null}
  </div>;
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="border border-zinc-200 bg-white p-5"><h2 className="mb-4 text-lg font-semibold">{title}</h2>{children}</section>;
}

function Field({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return <div><dt className="text-xs text-zinc-500">{label}</dt><dd className={`mt-1 text-sm font-medium ${mono ? "break-all font-mono text-xs" : ""}`}>{value}</dd></div>;
}
