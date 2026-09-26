import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminPagePermission } from "@/src/modules/admin";
import {
  createAgentCommercialService,
  PayoutConfirmationForm,
  transitionAgentRewardAction,
  type AgentRewardFinanceDetail,
  type AgentRewardState,
} from "@/src/modules/agent-commercial";

export default async function AgentRewardFinanceDetailPage({ params }: { params: Promise<{ saleLinkId: string }> }) {
  await requireAdminPagePermission("admin.agent_rewards.approve");
  const { saleLinkId } = await params;
  const reward = await createAgentCommercialService().financeReward(saleLinkId);
  if (!reward) notFound();
  const amountLabel = money(reward.amount, reward.currency);
  return (
    <main className="space-y-6">
      <header>
        <Link className="text-sm font-semibold text-emerald-800 hover:underline" href="/admin/agents/rewards">← К очереди выплат</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Финансы / Агенты</p><h1 className="mt-1 text-3xl font-semibold">{reward.agentName}</h1><p className="mt-2 text-sm text-zinc-600">Заказ {reward.orderNumber} · {reward.customerName}</p></div>
          <div className="text-right"><p className="text-xs uppercase text-zinc-500">Вознаграждение</p><p className="text-2xl font-semibold tabular-nums">{amountLabel}</p><p className="text-sm font-medium text-amber-900">{stateLabel(reward.state)}</p></div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Расчёт</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <CalculationRow amount={reward.equipmentNetAmount} currency={reward.currency} label="Оборудование без НДС" rate={reward.equipmentRatePercent}/>
            <CalculationRow amount={reward.installationNetAmount} currency={reward.currency} label="Монтаж Novotech без НДС" rate={reward.installationRatePercent}/>
            <CalculationRow amount={reward.excludedNetAmount} currency={reward.currency} label="Исключено из расчёта" rate={0}/>
          </dl>
          <div className="mt-4 border-t border-zinc-200 pt-4 text-right"><span className="text-sm text-zinc-600">Итого: </span><strong className="text-lg tabular-nums">{amountLabel}</strong></div>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Коммерческое основание</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Fact label="Продажа" value={reward.saleState}/><Fact label="Оплата клиента" value={reward.paymentState}/>
            <Fact label="Реализовано" value={money(reward.realizedGrossAmount, reward.currency)}/><Fact label="Оплачено клиентом" value={money(reward.paidGrossAmount, reward.currency)}/>
            <Fact label="Полная оплата" value={reward.fullyPaidAt ? dateTime(reward.fullyPaidAt) : "—"}/><Fact label="Классификация" value={reward.classificationComplete ? "Завершена" : "Не завершена"}/>
          </dl>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Evidence title="Документы реализации" currency={reward.currency} items={reward.realizationEvidence.map((item) => ({ key: item.ref, label: item.type === "WORK_ACT" ? "Акт выполненных работ" : "Расходная накладная", number: item.number, date: item.date, amount: item.amount }))}/>
        <Evidence title="Документы оплаты клиента" currency={reward.currency} items={reward.paymentEvidence.map((item) => ({ key: item.ref, label: item.type === "CASH" ? "Поступление в кассу" : "Поступление на счёт", number: item.number, date: item.date, amount: item.allocatedAmount }))}/>
      </section>

      <FinanceAction reward={reward} amountLabel={amountLabel}/>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">История решений</h2>
        {reward.events.length ? <ol className="mt-4 space-y-3">{reward.events.map((event) => <li className="border-l-2 border-zinc-200 pl-4 text-sm" key={event.id}><p className="font-medium">{event.fromState ?? "Создано"} → {event.toState}</p><p className="mt-1 text-xs text-zinc-500">{dateTime(event.createdAt)}{event.amount !== null && event.currency ? ` · ${money(event.amount, event.currency)}` : ""}{event.payoutReference ? ` · документ ${event.payoutReference}` : ""}</p>{event.reason ? <p className="mt-1 text-zinc-600">{event.reason}</p> : null}</li>)}</ol> : <p className="mt-3 text-sm text-zinc-600">Решений пока нет.</p>}
      </section>
    </main>
  );
}

function FinanceAction({ reward, amountLabel }: { reward: AgentRewardFinanceDetail; amountLabel: string }) {
  if (reward.state === "READY_FOR_PAYOUT") return <PayoutConfirmationForm amountLabel={amountLabel} expectedUpdatedAt={reward.updatedAt} idempotencyKey={randomUUID()} saleLinkId={reward.saleLinkId}/>;
  if (reward.state === "PAID") return <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5"><h2 className="text-lg font-semibold text-emerald-900">Выплачено</h2><p className="mt-2 text-sm text-emerald-900">{reward.paidAt ? dateTime(reward.paidAt) : "Дата не указана"}{reward.payoutReference ? ` · документ ${reward.payoutReference}` : ""}</p></section>;
  const next: Partial<Record<AgentRewardState, readonly [AgentRewardState, string]>> = {
    ELIGIBLE: ["FINANCE_REVIEW", "Начать финансовую проверку"],
    FINANCE_REVIEW: ["APPROVED", "Одобрить расчёт"],
    APPROVED: ["READY_FOR_PAYOUT", "Передать к выплате"],
  };
  const action = next[reward.state];
  if (!action) return <p className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600">Для текущего состояния действие выплаты недоступно.</p>;
  return <section className="rounded-lg border border-zinc-200 bg-white p-5"><h2 className="text-lg font-semibold">Следующий шаг Finance</h2><p className="mt-1 text-sm text-zinc-600">Текущий этап должен быть завершён до регистрации фактической выплаты.</p><form action={transitionAgentRewardAction} className="mt-4 space-y-3"><input name="agentId" type="hidden" value={reward.agentId}/><input name="saleLinkId" type="hidden" value={reward.saleLinkId}/><input name="targetState" type="hidden" value={action[0]}/><label className="block text-sm font-medium">Основание решения<input className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" maxLength={1000} name="reason" required/></label><button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white" type="submit">{action[1]}</button></form>{reward.state === "FINANCE_REVIEW" ? <form action={transitionAgentRewardAction} className="mt-4 border-t border-zinc-100 pt-4"><input name="agentId" type="hidden" value={reward.agentId}/><input name="saleLinkId" type="hidden" value={reward.saleLinkId}/><input name="targetState" type="hidden" value="BLOCKED"/><label className="block text-sm font-medium">Причина блокировки<input className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" maxLength={1000} name="reason" required/></label><button className="mt-3 min-h-11 rounded-md border border-red-300 px-4 text-sm font-semibold text-red-800" type="submit">Заблокировать</button></form> : null}</section>;
}

function CalculationRow({ amount, currency, label, rate }: { amount: number; currency: string; label: string; rate: number }) { return <div className="grid grid-cols-[1fr_auto_auto] gap-3"><dt>{label}</dt><dd className="tabular-nums">{money(amount, currency)}</dd><dd className="font-semibold">× {rate}%</dd></div>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs uppercase text-zinc-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>; }
function Evidence({ title, currency, items }: { title: string; currency: string; items: Array<{ key: string; label: string; number: string; date: string; amount: number }> }) { return <section className="rounded-lg border border-zinc-200 bg-white p-5"><h2 className="text-lg font-semibold">{title}</h2>{items.length ? <ul className="mt-3 space-y-3">{items.map((item) => <li className="text-sm" key={item.key}><span className="font-medium">{item.label} {item.number || "—"}</span><span className="ml-2 tabular-nums">{money(item.amount, currency)}</span><span className="block text-xs text-zinc-500">{dateTime(item.date)}</span></li>)}</ul> : <p className="mt-3 text-sm text-zinc-600">Подтверждённых документов нет.</p>}</section>; }
function money(amount: number, currency: string) { return new Intl.NumberFormat("ru-MD", { style: "currency", currency }).format(amount); }
function dateTime(value: string) { return new Date(value).toLocaleString("ru-MD"); }
function stateLabel(state: AgentRewardState) { return { FORECAST: "Начисляется", ELIGIBLE: "Готово к финансовой проверке", FINANCE_REVIEW: "Проверяется Finance", APPROVED: "Одобрено", READY_FOR_PAYOUT: "Готово к выплате", PAID: "Выплачено", ADJUSTED: "Скорректировано", BLOCKED: "Заблокировано" }[state]; }
