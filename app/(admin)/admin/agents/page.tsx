import Link from "next/link";
import { requireAdminPagePermission } from "@/src/modules/admin";
import { createCommercialAgentApplicationService } from "@/src/modules/agent-application";
import { createAgentOperationsService } from "@/src/modules/agent-operations";

type Query = { search?: string; status?: string; compliance?: string; auth?: string; oneC?: string; contract?: string; project?: string };

export default async function AdminAgentsPage({ searchParams = Promise.resolve({}) }: { searchParams?: Promise<Query> } = {}) {
  const [context, query] = await Promise.all([requireAdminPagePermission("admin.agents.view"), searchParams]);
  const canManage = context.permissions.includes("admin.agents.manage");
  const canApproveRewards = context.permissions.includes("admin.agent_rewards.approve");
  const [agents, reviewQueueCount] = await Promise.all([
    createAgentOperationsService().list(query),
    canManage ? createCommercialAgentApplicationService().countReviewQueue() : Promise.resolve(0),
  ]);
  return <main className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Партнёры / Агенты</p><h1 className="mt-1 text-3xl font-semibold">Операционный центр агентов</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600">Auth, жизненный цикл, точные привязки 1С и текущая экономическая проекция.</p></div><div className="flex flex-wrap gap-2">{canApproveRewards ? <Link className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href="/admin/agents/rewards">К выплате агентам</Link> : null}{canManage ? <Link className="inline-flex min-h-11 items-center rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-800" href="/admin/agents/applications">Заявки · {reviewQueueCount}</Link> : null}<Link className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold" href="/admin/agents/referrals">Рефералы</Link></div></header>
    <form className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-3 md:grid-cols-4 xl:grid-cols-8" method="get">
      <label className="text-xs font-medium md:col-span-2">Поиск<input className="mt-1 h-10 w-full rounded border border-zinc-300 px-3 text-sm" defaultValue={query.search} name="search" placeholder="Код, имя или email"/></label>
      <Filter label="Статус" name="status" value={query.status} options={["ACTIVE", "APPLIED", "COMPLIANCE_REVIEW", "CONTRACT_PENDING", "APPROVED", "SUSPENDED"]}/>
      <Filter label="Compliance" name="compliance" value={query.compliance} options={["APPROVED", "PENDING", "REVIEW_REQUIRED", "BLOCKED", "UNREVIEWED"]}/>
      <Filter label="Auth" name="auth" value={query.auth} options={["READY", "LINKED", "MISSING"]}/>
      <Filter label="1С" name="oneC" value={query.oneC} options={["LINKED", "MISSING"]}/>
      <Filter label="Договор" name="contract" value={query.contract} options={["VERIFIED", "LEGACY", "MISSING", "MISMATCH"]}/>
      <Filter label="Проект" name="project" value={query.project} options={["VERIFIED", "MISSING", "MISMATCH"]}/>
      <div className="flex gap-2 md:col-span-4 xl:col-span-8"><button className="min-h-10 rounded bg-zinc-900 px-4 text-sm font-semibold text-white" type="submit">Применить</button><Link className="inline-flex min-h-10 items-center rounded border border-zinc-300 px-4 text-sm font-semibold" href="/admin/agents">Сбросить</Link></div>
    </form>
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-3 py-3">Агент</th><th className="px-3 py-3">Portal</th><th className="px-3 py-3">Auth</th><th className="px-3 py-3">1С</th><th className="px-3 py-3">Договор</th><th className="px-3 py-3">Проект</th><th className="px-3 py-3">Экономика</th><th className="px-3 py-3">Проверено</th><th className="px-3 py-3"></th></tr></thead><tbody>{agents.map((agent) => <tr className="border-t border-zinc-100 align-top" key={agent.id}><td className="px-3 py-3"><span className="block font-mono text-xs">{agent.agentCode}</span><span className="font-semibold">{agent.displayName}</span></td><td className="px-3 py-3">{agent.status}<span className="block text-xs text-zinc-500">{agent.complianceStatus}</span></td><td className="px-3 py-3">{agent.auth.linked ? agent.auth.emailConfirmed ? "CONFIRMED" : "LINKED" : "MISSING"}<span className="block text-xs text-zinc-500">Quick Auth: {agent.auth.quickAuthReady ? "READY" : "NO"}</span></td><td className="px-3 py-3">{agent.counterpartyLinked ? "LINKED" : "MISSING"}<span className="block text-xs text-zinc-500">{agent.counterpartyCodeState}</span></td><td className="px-3 py-3">{agent.contractState}</td><td className="px-3 py-3">{agent.projectState}</td><td className="px-3 py-3">{agent.economicState}</td><td className="px-3 py-3 text-xs text-zinc-500">{agent.lastVerifiedAt ? new Date(agent.lastVerifiedAt).toLocaleString("ru-RU") : "—"}</td><td className="px-3 py-3"><Link className="font-semibold text-emerald-800 hover:underline" href={`/admin/agents/${agent.id}`}>Открыть</Link></td></tr>)}</tbody></table></div>{agents.length === 0 ? <p className="p-6 text-sm text-zinc-600">По выбранным условиям агенты не найдены.</p> : null}</section>
  </main>;
}

function Filter({ label, name, value, options }: { label: string; name: string; value?: string; options: string[] }) { return <label className="text-xs font-medium">{label}<select className="mt-1 h-10 w-full rounded border border-zinc-300 px-2 text-sm" defaultValue={value ?? ""} name={name}><option value="">Все</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>; }
