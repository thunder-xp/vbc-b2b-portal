import { redirect } from "next/navigation";

import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { respondInstallationOfferAction } from "@/src/modules/retail-marketplace/actions";
import { getInstallationAssignmentDispatcher } from "@/src/modules/retail-marketplace/server";
import type { InstallationAssignmentView, PartnerInstallationAssignmentDto } from "@/src/modules/retail-marketplace/types";

const views: Array<{ key: InstallationAssignmentView; label: string }> = [
  { key: "offers", label: "Предложения" }, { key: "active", label: "Активные" }, { key: "completed", label: "Завершённые" },
];
const scopeLabels: Record<string, string> = { camera_installation: "Монтаж камер", cable_laying: "Прокладка кабеля", commissioning: "Пусконаладка", remote_configuration: "Удалённая настройка" };

export default async function InstallationOrdersPage({ searchParams }: { searchParams: Promise<{ view?: string; result?: string }> }) {
  const [context, query] = await Promise.all([getPartnerWorkspaceContextAction(), searchParams]);
  if (!context.success || !context.data.companyId || context.data.accessState !== "active") redirect("/cabinet");
  const view = views.some((entry) => entry.key === query.view) ? query.view as InstallationAssignmentView : "offers";
  const assignments = await getInstallationAssignmentDispatcher().list(context.data.companyId, view);
  return <main className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-xs font-semibold uppercase text-emerald-700">Installation Marketplace</p><h1 className="mt-1 text-2xl font-semibold">Заказы на монтаж</h1><p className="mt-2 text-sm text-zinc-600">Предложения по монтажу CCTV для вашей команды. До принятия показывается только необходимый объём работ.</p></header>
    {query.result ? <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm">{query.result === "accept" ? "Предложение принято." : "Отказ сохранён, заказ передан на повторное назначение."}</p> : null}
    <nav aria-label="Состояние монтажных заказов" className="flex flex-wrap gap-2">{views.map((entry) => <a aria-current={view === entry.key ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold ${view === entry.key ? "border-emerald-700 bg-emerald-700 text-white" : "border-zinc-300 bg-white"}`} href={`/cabinet/installation-orders?view=${entry.key}`} key={entry.key}>{entry.label}</a>)}</nav>
    {assignments.length ? <div className="grid gap-4">{assignments.map((assignment) => <AssignmentCard assignment={assignment} key={assignment.attemptId} />)}</div> : <p className="border border-zinc-200 bg-white p-6 text-sm text-zinc-600">В этом разделе пока нет монтажных заказов.</p>}
  </main>;
}

function AssignmentCard({ assignment }: { assignment: PartnerInstallationAssignmentDto }) {
  const deadline = new Intl.DateTimeFormat("ru-MD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(assignment.deadlineAt));
  return <article className="grid gap-4 border border-zinc-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0 space-y-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold">CCTV</span><h2 className="font-semibold">{assignment.locality}</h2></div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">{assignment.scope.map((line) => <div className="flex justify-between gap-4 border-b border-zinc-100 py-1" key={line.serviceType}><dt>{scopeLabels[line.serviceType] ?? line.serviceType}</dt><dd className="font-medium">{line.quantity} {line.unitCode === "meter" ? "м" : line.unitCode === "service" ? "услуга" : "шт."}</dd></div>)}</dl>
      {assignment.status === "offered" ? <p className="text-sm text-amber-800">Ответить до {deadline}</p> : null}
      {assignment.status === "accepted" && assignment.customer && assignment.exactAddress ? <div className="border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm"><p className="font-semibold">Контакт после принятия</p><p>{assignment.customer.name}, {assignment.customer.phone}</p><p>{assignment.exactAddress.locality}, {assignment.exactAddress.street} {assignment.exactAddress.building}</p></div> : null}
    </div>
    {assignment.status === "offered" ? <div className="flex min-w-56 flex-col gap-2"><form action={respondInstallationOfferAction}><input name="attemptId" type="hidden" value={assignment.attemptId}/><input name="decision" type="hidden" value="accept"/><input name="idempotencyKey" type="hidden" value={crypto.randomUUID()}/><button className="min-h-11 w-full rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" type="submit">Принять</button></form>
      <details><summary className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold">Отказаться</summary><form action={respondInstallationOfferAction} className="mt-2 grid gap-2"><input name="attemptId" type="hidden" value={assignment.attemptId}/><input name="decision" type="hidden" value="decline"/><input name="idempotencyKey" type="hidden" value={crypto.randomUUID()}/><select aria-label="Причина отказа" className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" name="reasonCode"><option value="">Без причины</option><option value="no_capacity">Нет свободной команды</option><option value="schedule_conflict">Не подходит срок</option><option value="region_issue">Регион</option><option value="technical_scope">Технический объём</option><option value="other">Другое</option></select><button className="min-h-11 rounded-md border border-zinc-900 px-4 text-sm font-semibold" type="submit">Подтвердить отказ</button></form></details></div> : null}
  </article>;
}
