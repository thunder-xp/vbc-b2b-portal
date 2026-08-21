import { redirect } from "next/navigation";

import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { installationCopy, formatPartnerDate, type PartnerLocale } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { respondInstallationOfferAction, transitionPartnerInstallationExecutionAction } from "@/src/modules/retail-marketplace/actions";
import { getInstallationAssignmentDispatcher } from "@/src/modules/retail-marketplace/server";
import type { InstallationAssignmentView, PartnerInstallationAssignmentDto } from "@/src/modules/retail-marketplace/types";

const viewKeys: Array<{ key: InstallationAssignmentView; label: "offers" | "active" | "completed" }> = [
  { key: "offers", label: "offers" },
  { key: "active", label: "active" },
  { key: "completed", label: "completed" },
];
const scopeKeys: Record<string, "cameraInstallation" | "cableLaying" | "commissioning" | "remoteConfiguration"> = {
  camera_installation: "cameraInstallation",
  cable_laying: "cableLaying",
  commissioning: "commissioning",
  remote_configuration: "remoteConfiguration",
};
const executionKeys: Record<string, "scheduling" | "scheduled" | "inProgress" | "completedByProvider" | "confirmationPending" | "customerConfirmed" | "issueReported" | "disputed" | "resolved" | "cancelled"> = {
  scheduling: "scheduling",
  scheduled: "scheduled",
  in_progress: "inProgress",
  completed_by_provider: "completedByProvider",
  customer_confirmation_pending: "confirmationPending",
  customer_confirmed: "customerConfirmed",
  issue_reported: "issueReported",
  disputed: "disputed",
  resolved: "resolved",
  cancelled: "cancelled",
};

export default async function InstallationOrdersPage({ searchParams }: { searchParams: Promise<{ view?: string; result?: string }> }) {
  const [context, query, locale] = await Promise.all([getPartnerWorkspaceContextAction(), searchParams, getPartnerLocale()]);
  if (!context.success || !context.data.companyId || context.data.accessState !== "active") redirect("/cabinet");
  const copy = installationCopy(locale);
  const view = viewKeys.some((entry) => entry.key === query.view) ? query.view as InstallationAssignmentView : "offers";
  const assignments = await getInstallationAssignmentDispatcher().list(context.data.companyId, view);
  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase text-emerald-700">{copy.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold">{copy.title}</h1>
        <p className="mt-2 text-sm text-zinc-600">{copy.intro}</p>
      </header>
      {query.result && <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm">{query.result === "accept" ? copy.accepted : query.result === "updated" ? copy.updated : copy.declined}</p>}
      <nav aria-label={copy.navigation} className="flex flex-wrap gap-2">
        {viewKeys.map((entry) => <a aria-current={view === entry.key ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold ${view === entry.key ? "border-emerald-700 bg-emerald-700 text-white" : "border-zinc-300 bg-white"}`} href={`/cabinet/installation-orders?view=${entry.key}`} key={entry.key}>{copy[entry.label]}</a>)}
      </nav>
      {assignments.length ? <div className="grid gap-4">{assignments.map((assignment) => <AssignmentCard assignment={assignment} key={assignment.attemptId} locale={locale} />)}</div> : <p className="border border-zinc-200 bg-white p-6 text-sm text-zinc-600">{copy.empty}</p>}
    </main>
  );
}

function AssignmentCard({ assignment, locale }: { assignment: PartnerInstallationAssignmentDto; locale: PartnerLocale }) {
  const copy = installationCopy(locale);
  const deadline = formatPartnerDate(assignment.deadlineAt, locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <article className="grid gap-4 border border-zinc-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold">CCTV</span>
          <h2 className="font-semibold">{assignment.orderNumber} · {assignment.locality}</h2>
          {assignment.execution && <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">{copy[executionKeys[assignment.execution.state]]}</span>}
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {assignment.scope.map((line) => <div className="flex justify-between gap-4 border-b border-zinc-100 py-1" key={line.serviceType}><dt>{scopeKeys[line.serviceType] ? copy[scopeKeys[line.serviceType]] : line.serviceType}</dt><dd className="font-medium">{line.quantity} {line.unitCode === "meter" ? copy.meter : line.unitCode === "service" ? copy.service : copy.unit}</dd></div>)}
        </dl>
        {assignment.status === "offered" && <p className="text-sm text-amber-800">{copy.replyBy} {deadline}</p>}
        {assignment.status === "accepted" && assignment.customer && assignment.exactAddress && <div className="border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm"><p className="font-semibold">{copy.contactAfterAcceptance}</p><p>{assignment.customer.name}, {assignment.customer.phone}</p><p>{assignment.exactAddress.locality}, {assignment.exactAddress.street} {assignment.exactAddress.building}</p></div>}
        {assignment.execution?.scheduledStartAt && <p className="text-sm"><strong>{copy.date}:</strong> {formatPartnerDate(assignment.execution.scheduledStartAt, locale, { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Chisinau" })}{assignment.execution.scheduledEndAt ? ` — ${formatPartnerDate(assignment.execution.scheduledEndAt, locale, { timeStyle: "short", timeZone: "Europe/Chisinau" })}` : ""}</p>}
      </div>
      {assignment.status === "offered" && <OfferActions assignment={assignment} locale={locale} />}
      {assignment.execution && <ExecutionActions execution={assignment.execution} locale={locale} />}
    </article>
  );
}

function OfferActions({ assignment, locale }: { assignment: PartnerInstallationAssignmentDto; locale: PartnerLocale }) {
  const copy = installationCopy(locale);
  return <div className="flex min-w-56 flex-col gap-2">
    <form action={respondInstallationOfferAction}><input name="attemptId" type="hidden" value={assignment.attemptId}/><input name="decision" type="hidden" value="accept"/><input name="idempotencyKey" type="hidden" value={crypto.randomUUID()}/><button className="min-h-11 w-full rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" type="submit">{copy.accept}</button></form>
    <details><summary className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold">{copy.decline}</summary><form action={respondInstallationOfferAction} className="mt-2 grid gap-2"><input name="attemptId" type="hidden" value={assignment.attemptId}/><input name="decision" type="hidden" value="decline"/><input name="idempotencyKey" type="hidden" value={crypto.randomUUID()}/><select aria-label={copy.declineReason} className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" name="reasonCode"><option value="">{copy.noReason}</option><option value="no_capacity">{copy.noCapacity}</option><option value="schedule_conflict">{copy.scheduleConflict}</option><option value="region_issue">{copy.regionIssue}</option><option value="technical_scope">{copy.technicalScope}</option><option value="other">{copy.other}</option></select><button className="min-h-11 rounded-md border border-zinc-900 px-4 text-sm font-semibold" type="submit">{copy.confirmDecline}</button></form></details>
  </div>;
}

function ExecutionActions({ execution, locale }: { execution: NonNullable<PartnerInstallationAssignmentDto["execution"]>; locale: PartnerLocale }) {
  const copy = installationCopy(locale);
  if (execution.state === "scheduling" || execution.state === "scheduled") return <div className="min-w-64"><details><summary className="flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white">{execution.state === "scheduled" ? copy.changeDate : copy.scheduleDate}</summary><form action={transitionPartnerInstallationExecutionAction} className="mt-2 grid gap-2"><CommandFields command="schedule" execution={execution}/><label className="grid gap-1 text-xs"><span>{copy.dateTime}</span><input className="min-h-11 border border-zinc-300 px-3 text-sm" name="scheduledStartAt" required type="datetime-local"/></label><label className="grid gap-1 text-xs"><span>{copy.optionalEnd}</span><input className="min-h-11 border border-zinc-300 px-3 text-sm" name="scheduledEndAt" type="datetime-local"/></label><input className="min-h-11 border border-zinc-300 px-3 text-sm" maxLength={500} name="note" placeholder={copy.shortNote}/><button className="min-h-11 border border-zinc-900 px-4 text-sm font-semibold">{copy.saveDate}</button></form></details>{execution.state === "scheduled" && <SimpleExecutionCommand execution={execution} locale={locale}/>}</div>;
  if (execution.state === "in_progress") return <form action={transitionPartnerInstallationExecutionAction} className="grid min-w-64 gap-2"><CommandFields command="complete" execution={execution}/><input className="min-h-11 border border-zinc-300 px-3 text-sm" maxLength={500} name="note" placeholder={copy.optionalNote}/><button className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white">{copy.completeWork}</button></form>;
  return null;
}

function CommandFields({ command, execution }: { command: "schedule" | "start" | "complete"; execution: NonNullable<PartnerInstallationAssignmentDto["execution"]> }) {
  return <><input name="executionId" type="hidden" value={execution.id}/><input name="command" type="hidden" value={command}/><input name="revision" type="hidden" value={execution.revision}/><input name="idempotencyKey" type="hidden" value={crypto.randomUUID()}/></>;
}

function SimpleExecutionCommand({ execution, locale }: { execution: NonNullable<PartnerInstallationAssignmentDto["execution"]>; locale: PartnerLocale }) {
  return <form action={transitionPartnerInstallationExecutionAction} className="mt-2"><CommandFields command="start" execution={execution}/><button className="min-h-11 w-full rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white">{installationCopy(locale).startWork}</button></form>;
}
