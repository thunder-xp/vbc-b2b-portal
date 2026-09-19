import Link from "next/link";
import { notFound } from "next/navigation";
import { createAgentCabinetService } from "@/src/modules/agent-cabinet";
import { getAgentCabinetLocale } from "@/src/modules/agent-cabinet/locale";
import { agentDate, attributionStatus, attributionStatusTone, eventLabel, maskedContact } from "@/src/modules/agent-cabinet/operational-presentation";
import { AgentPageHeader, secondaryButton } from "@/src/modules/agent-cabinet/components/PageHeader";
import { CabinetStatusBadge, OperationalTimeline, cabinetPageNarrow, cabinetSurface, cabinetTextAction } from "@/src/modules/cabinet-experience/components";

export default async function AgentClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [item, locale] = await Promise.all([createAgentCabinetService().client((await params).id), getAgentCabinetLocale()]); if (!item) notFound(); const ro = locale === "ro";
  return <main className={cabinetPageNarrow}><AgentPageHeader title={item.name} actions={<Link className={secondaryButton} href="/agent/clients">{ro ? "Toți clienții" : "Все клиенты"}</Link>}/>
    <section className={`p-4 sm:p-5 ${cabinetSurface}`}><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-zinc-500">{ro ? "Atribuire" : "Закрепление"}</p><div className="mt-1"><CabinetStatusBadge label={attributionStatus(item.status,locale)} tone={attributionStatusTone(item.status)} /></div></div><div><p className="text-xs text-zinc-500">{ro ? "Protecție până la" : "Защита до"}</p><p className="mt-1 font-semibold tabular-nums">{agentDate(item.extendedUntil ?? item.protectionUntil,locale,true)}</p></div></div></section>
    <dl className="grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2">{[[ro ? "Referință sigură" : "Безопасная ссылка",`#${item.referralId.slice(0,8).toUpperCase()}`],[ro ? "Contact" : "Контакт",maskedContact(item.phone,item.email,locale)],[ro ? "Localitate / obiect" : "Город / объект",[item.locality,item.objectType].filter(Boolean).join(" · ")||"—"],[ro ? "Necesitate" : "Потребность",item.needSummary]].map(([a,b])=><div className="bg-white p-4" key={a}><dt className="text-xs text-zinc-500">{a}</dt><dd className="mt-1 text-sm">{b}</dd></div>)}</dl>
    <Link className={cabinetTextAction} href={`/agent/referrals/${item.referralId}`}>{ro ? "Deschide recomandarea asociată" : "Открыть связанную рекомендацию"}</Link>
    <section className={`p-4 sm:p-5 ${cabinetSurface}`}><h2 className="mb-4 text-lg font-semibold tracking-tight">{ro ? "Istoric factual" : "Фактическая история"}</h2><OperationalTimeline items={(item.events?.length ? item.events : [{id:item.id,type:"ATTRIBUTION_CREATED",createdAt:item.attributedAt}]).map(event => ({id:event.id,label:eventLabel(event.type,locale),date:agentDate(event.createdAt,locale,true)}))}/></section>
  </main>;
}
