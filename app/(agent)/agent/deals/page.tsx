import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { agentCabinetCopy, createAgentCabinetService, getAgentCabinetLocale } from "@/src/modules/agent-cabinet";
import { WorkspaceHeader, cabinetList, cabinetPageWide, cabinetRow } from "@/src/modules/cabinet-experience/components";

export default async function AgentDealsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const [result, locale] = await Promise.all([createAgentCabinetService().deals(Number(params.page ?? 1)), getAgentCabinetLocale()]);
  const copy = agentCabinetCopy[locale];
  return <main className={cabinetPageWide}>
    <WorkspaceHeader eyebrow={copy.cabinet} title={copy.dealsTitle} description={copy.dealsBody}/>
    {result.items.length ? <div className={cabinetList}>{result.items.map((deal) =>
      <Link className={`grid min-h-20 gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${cabinetRow}`} href={`/agent/deals/${deal.id}`} key={deal.id}>
        <span><strong className="block">{deal.client}</strong><span className="mt-1 block text-sm text-zinc-600">{deal.orderNumber} · {deal.orderState ?? deal.state ?? "LINKED"}</span></span>
        <span className="flex items-center gap-4"><span className="text-right"><strong className="block tabular-nums">{money(deal.realizedAmount ?? 0, deal.currency, locale)}</strong><span className="block text-xs text-zinc-500">{deal.paymentState ?? "UNPAID"}</span><span className="block text-xs font-medium text-emerald-800">{locale === "ro" ? "Recompensă" : "Вознаграждение"}: {money(deal.rewardAmount ?? 0, deal.currency, locale)}</span></span><ArrowRight className="size-4 text-zinc-400"/></span>
      </Link>)}</div> : <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600">{copy.noDeals}</p>}
  </main>;
}

function money(value: number, currency: string, locale: "ru" | "ro") { return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { style: "currency", currency }).format(value); }
