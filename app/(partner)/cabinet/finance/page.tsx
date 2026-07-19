import { getFinanceOverviewAction } from "@/src/modules/finance/actions";
import { FinanceOverview } from "@/src/modules/finance/components";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const result = await getFinanceOverviewAction();
  if (!result.success) {
    return <section className="mx-auto max-w-6xl px-4 py-8"><h1 className="text-2xl font-semibold">Финансы</h1><p className="mt-4 text-sm text-zinc-600">Финансовые данные недоступны. Проверьте права доступа или обратитесь в Novotech.</p></section>;
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8"><p className="text-xs font-semibold uppercase text-emerald-700">Партнёрский кабинет</p><h1 className="mt-2 text-3xl font-semibold text-zinc-950">Финансы</h1><p className="mt-2 max-w-2xl text-sm text-zinc-600">Текущий баланс взаиморасчётов по договорам. Источник данных — 1С.</p></header>
      <FinanceOverview overview={result.data} />
    </main>
  );
}
