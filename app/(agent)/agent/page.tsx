import { getAuthenticatedUser } from "@/src/modules/access-control/actions/service-factory";
import { createAgentDomainService } from "@/src/modules/agent-domain";

export default async function AgentHomePage() {
  const user = await getAuthenticatedUser();
  const agent = await createAgentDomainService().getAgentWorkspace(user.id);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8"><header><h1 className="text-3xl font-semibold">Рабочее пространство агента</h1><p className="mt-2 text-sm text-zinc-600">Безопасная стартовая оболочка. Партнёрские цены, финансы и история клиентов здесь не доступны.</p></header><section className="grid gap-4 sm:grid-cols-3"><Card label="Статус" value={agent?.status ?? "—"} /><Card label="Compliance" value={agent?.complianceStatus ?? "—"} /><Card label="Уровень" value={agent?.level ?? "—"} /></section><section className="rounded-lg border border-zinc-200 bg-white p-5"><h2 className="text-lg font-semibold">Реферальная работа</h2><p className="mt-2 text-sm text-zinc-600">Персональные ссылки и проверку заявок пока управляет Novotech. Финансовые начисления и выплаты остаются в 1С.</p></section></main>;
}

function Card({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-zinc-200 bg-white p-5"><p className="text-xs uppercase text-zinc-500">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>; }
