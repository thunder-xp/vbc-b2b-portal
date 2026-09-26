import Link from "next/link";
import { notFound } from "next/navigation";
import { agentCabinetCopy, agentRewardBlockedReasonCopy, agentRewardStateCopy, createAgentCabinetService, getAgentCabinetLocale } from "@/src/modules/agent-cabinet";
import { WorkspaceHeader, cabinetPageWide, cabinetSurface } from "@/src/modules/cabinet-experience/components";

export default async function AgentDealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [deal, locale] = await Promise.all([createAgentCabinetService().deal(id), getAgentCabinetLocale()]);
  if (!deal) notFound();
  const copy = agentCabinetCopy[locale];
  const rows = [
    [locale === "ro" ? "Echipamente fără TVA" : "Оборудование без НДС", deal.equipmentNetAmount, `${deal.equipmentRatePercent}%`],
    [locale === "ro" ? "Instalare Novotech fără TVA" : "Монтаж Novotech без НДС", deal.installationNetAmount, `${deal.installationRatePercent}%`],
    [locale === "ro" ? "Exclus" : "Исключено", deal.excludedNetAmount, "0%"],
  ] as const;
  return <main className={cabinetPageWide}>
    <Link className="text-sm font-semibold text-emerald-800 hover:underline" href="/agent/deals">← {copy.dealsTitle}</Link>
    <WorkspaceHeader eyebrow={deal.client} title={deal.orderNumber} description={`${deal.orderState ?? deal.state ?? "LINKED"} · ${deal.paymentState ?? "UNPAID"}`}/>
    <section className={`overflow-hidden ${cabinetSurface}`}><div className="divide-y divide-zinc-100">{rows.map(([label, amount, rate]) => <div className="grid grid-cols-[1fr_auto_auto] gap-4 p-4" key={label}><span>{label}</span><span className="tabular-nums">{money(amount, deal.currency, locale)}</span><strong>{rate}</strong></div>)}</div><div className="border-t border-zinc-200 bg-zinc-50 p-4 text-right"><p className="text-xs uppercase text-zinc-500">{copy.expectedReward}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money(deal.rewardAmount ?? 0, deal.currency, locale)}</p><p className="text-xs text-zinc-500">{deal.rewardState ? agentRewardStateCopy[locale][deal.rewardState] : "—"}</p>{deal.safeBlockedReason ? <p className="mt-1 text-xs text-amber-800">{agentRewardBlockedReasonCopy[locale][deal.safeBlockedReason]}</p> : null}{deal.paidAt ? <p className="mt-1 text-xs font-medium text-emerald-800">{locale === "ro" ? "Plătit la" : "Выплачено"}: {new Date(deal.paidAt).toLocaleDateString(locale === "ro" ? "ro-MD" : "ru-MD")}</p> : null}</div></section>
  </main>;
}
function money(value: number, currency: string, locale: "ru" | "ro") { return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { style: "currency", currency }).format(value); }
