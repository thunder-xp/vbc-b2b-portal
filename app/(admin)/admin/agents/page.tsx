import Link from "next/link";

import { requireAdminPagePermission } from "@/src/modules/admin";
import { createCommercialAgentApplicationService } from "@/src/modules/agent-application";
import { createCommercialAgentAction, createAgentDomainService } from "@/src/modules/agent-domain";

export default async function AdminAgentsPage() {
  const context = await requireAdminPagePermission("admin.agents.view");
  const canManage = context.permissions.includes("admin.agents.manage");
  const [agents, reviewQueueCount] = await Promise.all([
    createAgentDomainService().listAgents(),
    canManage ? createCommercialAgentApplicationService().countReviewQueue() : Promise.resolve(0),
  ]);
  return <main className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Коммерческая сеть</p><h1 className="mt-1 text-3xl font-semibold">Коммерческие агенты</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600">Отдельные от партнёров профили, compliance и управляемая реферальная атрибуция.</p></div><div className="flex flex-wrap gap-2">{canManage ? <Link className="inline-flex min-h-11 items-center rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-800" href="/admin/agents/applications">Заявки на регистрацию · {reviewQueueCount}</Link> : null}<Link className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold" href="/admin/agents/referrals">Рефералы</Link></div></header>
    {canManage ? <form action={createCommercialAgentAction} className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-5 sm:grid-cols-2 xl:grid-cols-4">
      <h2 className="text-lg font-semibold sm:col-span-2 xl:col-span-4">Новый агент</h2>
      <Field label="Имя / название" name="displayName" required />
      <label className="text-sm font-medium">Тип<select className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" name="agentType"><option value="INDIVIDUAL">Физическое лицо</option><option value="LEGAL_ENTITY">Юридическое лицо</option></select></label>
      <Field label="Телефон" name="phone" />
      <Field label="Email" name="email" type="email" />
      <Field label="Юридическое название" name="legalName" />
      <Field label="IDNO / IDNP" name="idnoIdnp" />
      <Field label="Населённый пункт" name="locality" />
      <Field label="Auth User UUID (необязательно)" name="userId" />
      <button className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white sm:col-span-2 xl:col-span-4" type="submit">Создать заявку агента</button>
    </form> : null}
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Код</th><th className="px-4 py-3">Агент</th><th className="px-4 py-3">Тип</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3">Compliance</th><th className="px-4 py-3">Уровень</th></tr></thead><tbody>{agents.map((agent) => <tr className="border-t border-zinc-100" key={agent.id}><td className="px-4 py-3 font-mono text-xs">{agent.agentCode}</td><td className="px-4 py-3"><Link className="font-semibold text-emerald-800 hover:underline" href={`/admin/agents/${agent.id}`}>{agent.displayName}</Link></td><td className="px-4 py-3">{agent.agentType}</td><td className="px-4 py-3">{agent.status}</td><td className="px-4 py-3">{agent.complianceStatus}</td><td className="px-4 py-3">{agent.level}</td></tr>)}</tbody></table></div>{agents.length === 0 ? <p className="p-6 text-sm text-zinc-600">Агентов пока нет.</p> : null}</section>
  </main>;
}

function Field({ label, name, required = false, type = "text" }: { label: string; name: string; required?: boolean; type?: string }) {
  return <label className="text-sm font-medium">{label}<input className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" name={name} required={required} type={type} /></label>;
}
