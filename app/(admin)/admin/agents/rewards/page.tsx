import Link from "next/link";

import { requireAdminPagePermission } from "@/src/modules/admin";
import { createAgentCommercialService, type AgentRewardState } from "@/src/modules/agent-commercial";

export default async function AgentRewardFinanceQueuePage() {
  await requireAdminPagePermission("admin.agent_rewards.approve");
  const rewards = await createAgentCommercialService().financeQueue(50);
  return (
    <main className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Финансы / Агенты</p>
        <h1 className="mt-1 text-3xl font-semibold">К выплате агентам</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Вознаграждения, для которых требуется следующий шаг Finance. Суммы рассчитаны из сохранённой коммерческой проекции и здесь не редактируются.
        </p>
      </header>
      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {rewards.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr><th className="px-4 py-3">Агент</th><th className="px-4 py-3">Основание</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3 text-right">Вознаграждение</th><th className="px-4 py-3"><span className="sr-only">Действие</span></th></tr>
              </thead>
              <tbody>
                {rewards.map((reward) => (
                  <tr className="border-t border-zinc-100" key={reward.saleLinkId}>
                    <td className="px-4 py-4"><strong className="block">{reward.agentName}</strong><span className="text-xs text-zinc-500">{reward.agentCode}</span></td>
                    <td className="px-4 py-4"><span className="block font-medium">Заказ {reward.orderNumber}</span><span className="text-xs text-zinc-500">{reward.customerName} · {new Date(reward.orderDate).toLocaleDateString("ru-MD")}</span></td>
                    <td className="px-4 py-4"><span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">{stateLabel(reward.state)}</span></td>
                    <td className="px-4 py-4 text-right font-semibold tabular-nums">{money(reward.amount, reward.currency)}</td>
                    <td className="px-4 py-4 text-right"><Link className="inline-flex min-h-10 items-center rounded-md bg-emerald-700 px-4 font-semibold text-white" href={`/admin/agents/rewards/${reward.saleLinkId}`}>Открыть</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p-6 text-sm text-zinc-600">Вознаграждений, требующих действия Finance, нет.</p>}
      </section>
      {rewards.length === 50 ? <p className="text-xs text-zinc-500">Показаны первые 50 вознаграждений. Очередь ограничена для предсказуемой нагрузки.</p> : null}
    </main>
  );
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("ru-MD", { style: "currency", currency }).format(amount);
}

function stateLabel(state: AgentRewardState) {
  return {
    ELIGIBLE: "Готово к финансовой проверке",
    FINANCE_REVIEW: "Проверяется Finance",
    APPROVED: "Одобрено",
    READY_FOR_PAYOUT: "Готово к выплате",
    FORECAST: "Начисляется",
    BLOCKED: "Заблокировано",
    PAID: "Выплачено",
    ADJUSTED: "Скорректировано",
  }[state];
}
