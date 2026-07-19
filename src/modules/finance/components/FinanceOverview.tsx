import { AlertCircle, ArrowDownLeft, ArrowUpRight, Clock3, WalletCards } from "lucide-react";

import type { FinanceOverview as FinanceOverviewModel } from "../types";

export function FinanceOverview({ overview }: { overview: FinanceOverviewModel }) {
  if (overview.contracts.length === 0) {
    return <EmptyFinanceState state={overview.state} />;
  }

  return (
    <div className="space-y-8">
      {(overview.showLastConfirmedNotice || overview.state === "stale") && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Показаны последние подтверждённые данные</p>
      )}
      <section aria-label="Итоги по валютам" className="grid gap-px overflow-hidden border border-zinc-200 bg-zinc-200 sm:grid-cols-2">
        {overview.summaries.flatMap((summary) => [
          <Summary key={`${summary.currencyCode}-receivable`} icon={ArrowUpRight} label="Партнёр должен Novotech" amount={summary.receivableTotal} currency={summary.currencyCode} tone="attention" />,
          <Summary key={`${summary.currencyCode}-advance`} icon={ArrowDownLeft} label="Аванс / переплата" amount={summary.advanceTotal} currency={summary.currencyCode} tone="positive" />,
        ])}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-700">Финансы</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">Баланс по договорам</h2>
          </div>
          {overview.synchronizedAt && (
            <p className="flex items-center gap-1.5 text-xs text-zinc-500"><Clock3 className="size-3.5" />Обновлено {formatDateTime(overview.synchronizedAt)}</p>
          )}
        </div>
        <div className="divide-y divide-zinc-200">
          {overview.contracts.map((contract) => (
            <article className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={contract.id}>
              <div className="min-w-0">
                <h3 className="font-semibold text-zinc-950">{contract.contractNumber || contract.contractName}</h3>
                {contract.contractName !== contract.contractNumber && <p className="mt-1 truncate text-sm text-zinc-500">{contract.contractName}</p>}
                <p className={`mt-2 inline-flex items-center gap-1.5 text-sm font-medium ${contract.balanceType === "receivable" ? "text-amber-700" : "text-emerald-700"}`}>
                  {contract.balanceType === "receivable" ? <AlertCircle className="size-4" /> : <ArrowDownLeft className="size-4" />}
                  {contract.balanceType === "receivable" ? "Задолженность" : "Аванс / переплата"}
                </p>
              </div>
              <p className="text-lg font-semibold tabular-nums text-zinc-950">{formatMoney(contract.absoluteDisplayAmount, contract.currencyCode)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function EmptyFinanceState({ state }: { state: FinanceOverviewModel["state"] }) {
  const content = state === "synchronized_zero"
    ? { title: "Нет ненулевых балансов", text: "По активным договорам задолженность и аванс отсутствуют." }
    : state === "never_synchronized"
      ? { title: "Финансовые данные ещё не загружены", text: "Данные по взаиморасчётам пока не синхронизированы с 1С." }
      : state === "mapping_missing"
        ? { title: "Финансовые данные недоступны", text: "Для компании ещё не настроена связь с учётной системой. Обратитесь к менеджеру Novotech." }
        : { title: "Финансовые данные временно недоступны", text: "Последние подтверждённые данные отсутствуют. Повторите попытку позже или обратитесь в Novotech." };
  return (
    <section className="border-t border-zinc-200 py-12 text-center">
      <WalletCards aria-hidden="true" className="mx-auto size-8 text-zinc-400" />
      <h2 className="mt-3 text-lg font-semibold text-zinc-900">{content.title}</h2>
      <p className="mt-1 text-sm text-zinc-600">{content.text}</p>
    </section>
  );
}

function Summary({ amount, currency, icon: Icon, label, tone }: { amount: string; currency: string; icon: typeof ArrowUpRight; label: string; tone: "attention" | "positive" }) {
  return <div className="bg-white p-5"><div className="flex items-center gap-2 text-sm text-zinc-600"><Icon className={`size-4 ${tone === "attention" ? "text-amber-600" : "text-emerald-600"}`} />{label}</div><p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-950">{formatMoney(amount, currency)}</p></div>;
}

function formatMoney(value: string, currency: string): string {
  return `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
