import Link from "next/link";
import { Plus, UserRoundSearch } from "lucide-react";
import { createAgentCabinetService } from "@/src/modules/agent-cabinet";
import { getAgentCabinetLocale } from "@/src/modules/agent-cabinet/locale";
import { agentDate, attributionStatus, attributionStatusTone, eventLabel, referralNextAction } from "@/src/modules/agent-cabinet/operational-presentation";
import { AgentPageHeader, primaryButton } from "@/src/modules/agent-cabinet/components/PageHeader";
import { ReferralStatusBadge } from "@/src/modules/agent-cabinet/components/StatusBadge";
import { CabinetEmptyState, CabinetStatusBadge, OperationalStatusPair, cabinetList, cabinetPageWide, cabinetRow } from "@/src/modules/cabinet-experience/components";
import { NumberedPagination } from "@/src/modules/platform-ui/NumberedPagination";

export default async function AgentReferralsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1); const [result, locale] = await Promise.all([createAgentCabinetService().referrals(page), getAgentCabinetLocale()]); const ro = locale === "ro";
  return <main className={cabinetPageWide}><AgentPageHeader title={ro ? "Recomandări" : "Рекомендации"} actions={<Link className={primaryButton} href="/agent/qr#referral-link"><Plus size={18}/>{ro ? "Creează recomandare" : "Создать рекомендацию"}</Link>}/>
    {result.items.length ? <ul className={cabinetList}>{result.items.map((item) => <li key={item.id}><Link className={`grid min-h-28 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_280px_240px] md:items-center ${cabinetRow}`} href={`/agent/referrals/${item.id}`}>
      <span className="min-w-0"><span className="font-mono text-xs text-zinc-500">#{item.id.slice(0,8).toUpperCase()} · {agentDate(item.submittedAt, locale)}</span><strong className="mt-1 block truncate text-sm">{item.name}</strong><span className="mt-1 block text-xs text-zinc-500">{item.locality ?? item.objectType ?? "—"}</span></span>
      <OperationalStatusPair primaryLabel={ro ? "Recomandare" : "Рекомендация"} primaryValue={<ReferralStatusBadge locale={locale} status={item.status}/>} secondaryLabel={ro ? "Atribuire" : "Закрепление"} secondaryValue={<CabinetStatusBadge label={attributionStatus(item.attributionStatus, locale)} tone={attributionStatusTone(item.attributionStatus)} />} />
      <span><span className="block text-xs text-zinc-500">{ro ? "Ultimul eveniment" : "Последнее событие"}</span><span className="mt-1 block text-sm">{eventLabel(item.lastEventType, locale)}</span><span className="mt-2 block text-xs font-semibold text-emerald-700">{referralNextAction(item, locale)}</span></span>
    </Link></li>)}</ul> : <CabinetEmptyState Icon={UserRoundSearch} actions={<Link className={primaryButton} href="/agent/qr#referral-link">{ro ? "Creează recomandare" : "Создать рекомендацию"}</Link>} body={ro ? "Creați prima recomandare pentru un client interesat." : "Создайте первую рекомендацию для заинтересованного клиента."} title={ro ? "Nu există recomandări" : "Рекомендаций пока нет"} />}
    <NumberedPagination ariaLabel={ro ? "Paginile recomandărilor" : "Страницы рекомендаций"} currentPage={page} hrefForPage={p => `/agent/referrals?page=${p}`} totalPages={Math.ceil(result.total / 20)}/>
  </main>;
}
