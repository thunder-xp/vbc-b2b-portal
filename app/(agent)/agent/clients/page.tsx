import Link from "next/link";
import { Plus, UsersRound } from "lucide-react";
import { createAgentCabinetService } from "@/src/modules/agent-cabinet";
import { getAgentCabinetLocale } from "@/src/modules/agent-cabinet/locale";
import { agentDate, attributionStatus, eventLabel, maskedContact } from "@/src/modules/agent-cabinet/operational-presentation";
import { AgentPageHeader, primaryButton } from "@/src/modules/agent-cabinet/components/PageHeader";
import { CabinetEmptyState } from "@/src/modules/cabinet-experience/components";
import { NumberedPagination } from "@/src/modules/platform-ui/NumberedPagination";

export default async function AgentClientsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1); const [result, locale] = await Promise.all([createAgentCabinetService().clients(page), getAgentCabinetLocale()]); const ro = locale === "ro";
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:py-8"><AgentPageHeader title={ro ? "Clienți atribuiți" : "Закреплённые клиенты"} actions={<Link className={primaryButton} href="/agent/qr#referral-link"><Plus size={18}/>{ro ? "Creează recomandare" : "Создать рекомендацию"}</Link>}/>
    {result.items.length ? <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">{result.items.map(item => <li key={item.id}><Link className="grid min-h-24 gap-3 p-4 hover:bg-zinc-50 md:grid-cols-[minmax(0,1fr)_180px_220px] md:items-center" href={`/agent/clients/${item.id}`}><span className="min-w-0"><strong className="block truncate text-sm">{item.name}</strong><span className="mt-1 block text-xs text-zinc-500">{maskedContact(item.phone,item.email,locale)} · {item.locality ?? "—"}</span><span className="mt-1 block font-mono text-xs text-zinc-400">#{item.referralId.slice(0,8).toUpperCase()}</span></span><span><span className="block text-xs text-zinc-500">{ro ? "Atribuire" : "Закрепление"}</span><span className="mt-1 block text-sm font-medium">{attributionStatus(item.status,locale)}</span><span className="mt-1 block text-xs text-zinc-500">{ro ? "Protecție până la" : "Защита до"} {agentDate(item.extendedUntil ?? item.protectionUntil,locale)}</span></span><span><span className="block text-xs text-zinc-500">{ro ? "Ultimul eveniment" : "Последнее событие"}</span><span className="mt-1 block text-sm">{eventLabel(item.lastEventType,locale)}</span>{item.lastEventAt ? <span className="mt-1 block text-xs text-zinc-500">{agentDate(item.lastEventAt,locale)}</span> : null}</span></Link></li>)}</ul> : <CabinetEmptyState Icon={UsersRound} actions={<Link className={primaryButton} href="/agent/qr#referral-link">{ro ? "Creează recomandare" : "Создать рекомендацию"}</Link>} body={ro ? "Clienții apar aici numai după o atribuire validă." : "Клиенты появятся здесь только после подтверждённого закрепления."} title={ro ? "Nu există clienți atribuiți" : "Закреплённых клиентов пока нет"} />}
    <NumberedPagination ariaLabel={ro ? "Paginile clienților" : "Страницы клиентов"} currentPage={page} hrefForPage={p => `/agent/clients?page=${p}`} totalPages={Math.ceil(result.total/20)}/>
  </main>;
}
