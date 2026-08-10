import { getFinanceOverviewAction } from "@/src/modules/finance/actions";
import { FinanceOverview, FinanceRefreshButton } from "@/src/modules/finance/components";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { listPartnerDocumentsAction } from "@/src/modules/documents/actions";
import { RelatedDocuments } from "@/src/modules/documents/components";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const [result, documentsResult] = await Promise.all([getFinanceOverviewAction(), listPartnerDocumentsAction({ section: "accounting", pageSize: 6 })]);
  if (!result.success) {
    return <section className="mx-auto max-w-6xl px-4 py-8"><h1 className="text-2xl font-semibold">Финансы</h1><p className="mt-4 text-sm text-zinc-600">Финансовые данные недоступны. Проверьте права доступа или обратитесь в Novotech.</p></section>;
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <BehaviorViewEvent dedupeKey="finance" eventName="finance_viewed" route="/cabinet/finance" sourceSurface="finance_overview" />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-emerald-700">Партнёрский кабинет</p><h1 className="mt-2 text-3xl font-semibold text-zinc-950">Финансы</h1><p className="mt-2 max-w-2xl text-sm text-zinc-600">Суммы к оплате и авансы по действующим договорам в исходной валюте.</p></div><FinanceRefreshButton /></header>
      <FinanceOverview overview={result.data} />
      <RelatedDocuments documents={documentsResult.success ? documentsResult.data.items : []} emptyMessage="Счета, акты и договоры появятся после безопасной синхронизации метаданных." title="Финансовые документы" />
    </main>
  );
}
