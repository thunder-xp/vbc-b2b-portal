import Link from "next/link";
import { notFound } from "next/navigation";

import { reviewCommercialAgentApplicationAction } from "@/src/modules/agent-application/actions";
import { createCommercialAgentApplicationService } from "@/src/modules/agent-application";
import { requireAdminPagePermission } from "@/src/modules/admin/services";

export default async function CommercialAgentApplicationAdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPagePermission("admin.agents.manage");
  const application = await createCommercialAgentApplicationService().getForAdmin((await params).id);
  if (!application) notFound();
  const reviewable = application.status === "SUBMITTED";
  return (
    <main className="space-y-5">
      <header>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800" href="/admin/agents/applications">← Все заявки</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div><p className="font-mono text-xs text-zinc-500">{application.id}</p><h1 className="mt-1 text-3xl font-semibold">{application.displayName ?? "Черновик заявителя"}</h1></div>
          <p className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold">{application.status}</p>
        </div>
      </header>
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Данные заявителя</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Тип" value={application.agentType === "LEGAL_ENTITY" ? "Юридическое лицо" : "Физическое лицо"} />
          <Fact label="Юридическое наименование" value={application.legalName} />
          <Fact label="Телефон" value={application.phone} />
          <Fact label="Email" value={application.email} />
          <Fact label="Населённый пункт" value={application.locality} />
          <Fact label="Профессия" value={application.profession} />
          <Fact label="Место работы" value={application.workplace} />
          <Fact label="Отправлена" value={application.submittedAt} />
          <Fact label="Revision" value={String(application.revision)} />
        </dl>
      </section>
      {reviewable ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <form action={reviewCommercialAgentApplicationAction} className="rounded-lg border border-zinc-200 bg-white p-5">
            <input name="applicationId" type="hidden" value={application.id} />
            <input name="action" type="hidden" value="REQUEST_CLARIFICATION" />
            <label className="grid gap-2 text-sm font-medium">Что нужно уточнить<textarea className="min-h-24 rounded-md border border-zinc-300 p-3" maxLength={1000} name="safeNote" required /></label>
            <button className="mt-3 min-h-11 w-full rounded-md border border-amber-300 px-4 text-sm font-semibold text-amber-900" type="submit">Запросить уточнение</button>
          </form>
          <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
            <form action={reviewCommercialAgentApplicationAction}>
              <input name="applicationId" type="hidden" value={application.id} />
              <input name="action" type="hidden" value="APPROVE" />
              <button className="min-h-11 w-full rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white" type="submit">Одобрить и создать Agent</button>
            </form>
            <form action={reviewCommercialAgentApplicationAction}>
              <input name="applicationId" type="hidden" value={application.id} />
              <input name="action" type="hidden" value="REJECT" />
              <label className="grid gap-2 text-sm font-medium">Причина отказа<textarea className="min-h-24 rounded-md border border-zinc-300 p-3" maxLength={1000} name="safeNote" required /></label>
              <button className="mt-3 min-h-11 w-full rounded-md border border-red-300 px-4 text-sm font-semibold text-red-800" type="submit">Отклонить</button>
            </form>
          </div>
        </section>
      ) : null}
      {application.provisionedAgentId ? <p className="text-sm text-zinc-600">Создан профиль Agent: <Link className="font-semibold text-emerald-800" href={`/admin/agents/${application.provisionedAgentId}`}>{application.provisionedAgentId}</Link></p> : null}
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return <div><dt className="text-zinc-500">{label}</dt><dd className="mt-1 font-medium text-zinc-950">{value || "—"}</dd></div>;
}
