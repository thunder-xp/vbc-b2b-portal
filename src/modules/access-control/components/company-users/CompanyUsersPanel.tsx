"use client";

import {
  appointCompanyOwnerAction,
  restoreCompanyEmployeeAction,
  revokeCompanyEmployeeAccessAction,
  revokeEmployeeInvitationAction,
  transferCompanyOwnerAction,
  updateCompanyEmployeeAccessAction,
} from "../../actions/company-users.actions";
import type { CompanyUserEvent, CompanyUserPage } from "../../types";
import {
  companyCopy,
  formatPartnerDateTime,
  partnerStatusLabel,
  usePartnerLocale,
  type PartnerLocale,
} from "../../../partner-locale";
import { InvitationActions } from "./InvitationActions";
import { InvitationForm } from "./InvitationForm";

type Copy = ReturnType<typeof companyCopy>;

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
  const locale = usePartnerLocale();
  const copy = companyCopy(locale);
  const adminCompanyId = isAdmin ? companyId : undefined;
  const currentOwnerMembershipId = page.records.find(
    (record) => record.recordType === "membership" && record.roleCode === "partner_owner" && record.membershipStatus === "active",
  )?.recordId;
  const employees = page.records.filter((record) => record.recordType === "membership" && record.membershipStatus !== "revoked");
  const pendingInvitations = page.records.filter((record) => record.recordType === "invitation" && record.invitationStatus === "pending");
  const history = page.records.filter((record) => record.membershipStatus === "revoked" || (record.recordType === "invitation" && record.invitationStatus !== "pending"));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase text-emerald-700">{isAdmin ? copy.adminCompany : copy.myCompany}</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{copy.employeesTitle}</h1>
        <p className="mt-2 text-sm text-zinc-600">{companyName}. {copy.employeesHint}</p>
      </header>
      <InvitationForm companyId={adminCompanyId} />
      <UserRecordsSection companyId={adminCompanyId} copy={copy} currentOwnerMembershipId={currentOwnerMembershipId} empty={copy.noEmployees} locale={locale} records={employees} title={copy.employees} />
      <UserRecordsSection companyId={adminCompanyId} copy={copy} currentOwnerMembershipId={currentOwnerMembershipId} empty={copy.noPendingInvitations} locale={locale} records={pendingInvitations} title={copy.awaitingAcceptance} />
      {history.length ? <UserRecordsSection companyId={adminCompanyId} copy={copy} currentOwnerMembershipId={currentOwnerMembershipId} empty="" locale={locale} records={history} title={copy.accessHistory} /> : null}
      {isAdmin && showAudit ? <AuditTrail copy={copy} events={events} locale={locale} /> : null}
    </div>
  );
}

function UserRecordsSection({ companyId, copy, currentOwnerMembershipId, empty, locale, records, title }: {
  companyId?: string;
  copy: Copy;
  currentOwnerMembershipId?: string;
  empty: string;
  locale: PartnerLocale;
  records: CompanyUserPage["records"];
  title: string;
}) {
  return <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
    <div className="border-b border-zinc-200 px-5 py-4"><h2 className="font-semibold text-zinc-950">{title}</h2><p className="text-sm text-zinc-500">{copy.total}: {records.length}</p></div>
    <div className="divide-y divide-zinc-200">{records.length ? records.map((record) => <article className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr_1fr_1.5fr]" key={`${record.recordType}:${record.recordId}`}>
      <div className="min-w-0"><p className="truncate font-semibold text-zinc-950">{record.fullName}</p><p className="truncate text-sm text-zinc-500">{record.email}</p><p className="mt-1 text-xs text-zinc-500">{partnerStatusLabel(locale, "access", record.membershipStatus ?? record.invitationStatus ?? "unknown")}</p></div>
      <div className="text-sm"><p className="text-xs font-medium uppercase text-zinc-500">{copy.role}</p><p className="mt-1 font-medium text-zinc-900">{roleLabel(record.roleCode, copy)}</p><p className="mt-1 text-xs text-zinc-500">{roleDescription(record.roleCode, copy)}</p></div>
      <div className="text-sm"><p className="text-xs font-medium uppercase text-zinc-500">{copy.priceAccess}</p><p className="mt-1 text-zinc-900">{record.priceAccess === "retail_only" ? copy.retailPricesOnly : copy.commercialPrices}</p></div>
      <div className="min-w-0">{record.recordType === "invitation" ? record.invitationStatus === "pending" ? <div className="flex flex-wrap gap-4"><InvitationActions companyId={companyId} invitationId={record.recordId} /><form action={revokeEmployeeInvitationAction}><HiddenScope companyId={companyId} name="invitationId" value={record.recordId} /><ReasonField copy={copy} /><button className="min-h-11 text-xs font-semibold text-red-700">{copy.revoke}</button></form></div> : null : record.membershipStatus !== "revoked" ? <MembershipActions companyId={companyId} copy={copy} currentOwnerMembershipId={currentOwnerMembershipId} record={record} /> : null}</div>
    </article>) : <p className="p-8 text-center text-sm text-zinc-500">{empty}</p>}</div>
  </section>;
}

function MembershipActions({ companyId, copy, currentOwnerMembershipId, record }: { companyId?: string; copy: Copy; currentOwnerMembershipId?: string; record: CompanyUserPage["records"][number] }) {
  return <div className="grid gap-3">
    <form action={updateCompanyEmployeeAccessAction} className="grid gap-2 sm:grid-cols-2">
      <HiddenScope companyId={companyId} name="membershipId" value={record.recordId} />
      <p className="text-xs leading-5 text-zinc-600 sm:col-span-2">{copy.roleChangeHint}</p>
      <select aria-label={copy.employeeRole} className="h-11 rounded border border-zinc-300 bg-white px-2 text-xs" defaultValue={record.roleCode} name="roleCode">
        {record.roleCode === "partner_owner" ? <option value="partner_owner">{copy.ownerRole}</option> : null}
        <option value="partner_manager">{copy.manager}</option><option value="partner_buyer">{copy.buyer}</option><option value="partner_accounting">{copy.accounting}</option><option value="partner_viewer">{copy.viewer}</option>
      </select>
      <select aria-label={copy.priceAccess} className="h-11 rounded border border-zinc-300 bg-white px-2 text-xs" defaultValue={record.priceAccess} name="priceAccess"><option value="full">{copy.fullCommercialPrices}</option><option value="retail_only">{copy.retailPricesOnly}</option></select>
      <ReasonField copy={copy} />
      <button className="min-h-11 justify-self-start text-xs font-semibold text-emerald-700">{copy.confirmAccessChanges}</button>
    </form>
    <div className="flex flex-wrap gap-4">
      <form action={record.membershipStatus === "suspended" ? restoreCompanyEmployeeAction : revokeCompanyEmployeeAccessAction}><HiddenScope companyId={companyId} name="membershipId" value={record.recordId} /><ReasonField copy={copy} /><button className="min-h-11 text-xs font-semibold text-zinc-700">{record.membershipStatus === "suspended" ? copy.restore : copy.revokeAccess}</button></form>
      {record.roleCode !== "partner_owner" && record.membershipStatus === "active" ? <form action={currentOwnerMembershipId ? transferCompanyOwnerAction : appointCompanyOwnerAction}><HiddenScope companyId={companyId} name="membershipId" value={record.recordId} />{currentOwnerMembershipId ? <><input name="currentOwnerMembershipId" type="hidden" value={currentOwnerMembershipId} /><input name="nextOwnerMembershipId" type="hidden" value={record.recordId} /></> : null}<ReasonField copy={copy} /><button className="min-h-11 text-xs font-semibold text-amber-700">{currentOwnerMembershipId ? copy.transferOwnership : copy.appointOwner}</button></form> : null}
    </div>
  </div>;
}

function ReasonField({ copy }: { copy: Copy }) {
  return <input aria-label={copy.changeReason} className="h-11 min-w-0 rounded border border-zinc-300 px-2 text-xs" maxLength={500} minLength={3} name="reason" placeholder={copy.changeReason} required />;
}

function HiddenScope({ companyId, name, value }: { companyId?: string; name: string; value: string }) {
  return <>{companyId ? <input name="companyId" type="hidden" value={companyId} /> : null}<input name={name} type="hidden" value={value} /></>;
}

function AuditTrail({ copy, events, locale }: { copy: Copy; events: CompanyUserEvent[]; locale: PartnerLocale }) {
  return <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-zinc-950">{copy.accessLog}</h2><div className="mt-4 divide-y divide-zinc-100">{events.map((event) => <div className="flex justify-between gap-4 py-3 text-sm" key={event.id}><span>{eventLabel(event.eventType, copy)}</span><time className="shrink-0 text-zinc-500">{formatPartnerDateTime(event.createdAt, locale)}</time></div>)}{!events.length ? <p className="py-4 text-sm text-zinc-500">{copy.noEvents}</p> : null}</div></section>;
}

function roleLabel(code: string, copy: Copy): string {
  return ({ partner_owner: copy.ownerRole, partner_manager: copy.manager, partner_buyer: copy.buyer, partner_accounting: copy.accounting, partner_viewer: copy.viewer } as Record<string, string>)[code] ?? copy.rolePending;
}

function roleDescription(code: string, copy: Copy): string {
  return ({ partner_owner: copy.ownerDescription, partner_manager: copy.managerDescription, partner_buyer: copy.buyerDescription, partner_accounting: copy.accountingDescription, partner_viewer: copy.viewerDescription } as Record<string, string>)[code] ?? copy.rolePending;
}

function eventLabel(type: string, copy: Copy): string {
  return ({ invitation_created: copy.invitationCreated, invitation_resent: copy.invitationResent, invitation_revoked: copy.invitationRevoked, invitation_accepted: copy.invitationAccepted, employee_suspended: copy.employeeSuspended, employee_restored: copy.employeeRestored, employee_access_revoked: copy.employeeRevoked, role_changed: copy.roleChanged, price_access_changed: copy.priceAccessChanged, owner_appointed: copy.ownerAppointed, owner_transferred: copy.ownerTransferred } as Record<string, string>)[type] ?? copy.accessChanged;
}
