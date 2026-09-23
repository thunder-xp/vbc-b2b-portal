import { ArrowRight, BookOpen, CircleAlert, Clock3, Plus, QrCode } from "lucide-react";
import Link from "next/link";

import {
  AttentionActionItem,
  SectionHeader,
  WorkspaceHeader,
  cabinetList,
  cabinetPageWide,
  cabinetPrimaryAction,
  cabinetRow,
  cabinetSecondaryAction,
  cabinetSurface,
  cabinetTextAction,
} from "@/src/modules/cabinet-experience/components";
import {
  agentCabinetCopy,
  agentEventCopy,
  createAgentCabinetService,
  getAgentCabinetLocale,
} from "@/src/modules/agent-cabinet";
import { openAgentAttentionAction } from "@/src/modules/agent-cabinet/actions";
import { ReferralStatusBadge } from "@/src/modules/agent-cabinet/components/StatusBadge";

export default async function AgentHomePage() {
  const [overview, commercialKpis, locale] = await Promise.all([
    createAgentCabinetService().overview(),
    createAgentCabinetService().commercialKpis(),
    getAgentCabinetLocale(),
  ]);
  if (!overview) return null;
  const copy = agentCabinetCopy[locale];

  return <main className={cabinetPageWide}>
    <WorkspaceHeader
      eyebrow={copy.today}
      title={copy.cabinet}
      actions={<><Link className={cabinetPrimaryAction} href="/agent/qr#referral-link"><Plus aria-hidden className="size-4" />{copy.primaryAction}</Link><Link className={cabinetSecondaryAction} href="/agent/qr"><QrCode aria-hidden className="size-4" />{copy.showQr}</Link></>}
    />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={copy.today}>
      {[
        [copy.commercialClients, String(commercialKpis.clients)],
        [copy.dealsInProgress, String(commercialKpis.dealsInProgress)],
        [copy.expectedReward, formatMoney(commercialKpis.expectedReward, commercialKpis.currency, locale)],
        [copy.availablePayout, formatMoney(commercialKpis.availablePayout, commercialKpis.currency, locale)],
      ].map(([label, value]) => <div className={`p-4 ${cabinetSurface}`} key={label}><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>)}
    </section>

    {overview.attentionItems.length ? <section className="space-y-3" aria-label={copy.attention}><SectionHeader title={copy.attention}/><div className="space-y-2">{overview.attentionItems.map((item) => <AttentionActionItem action={openAgentAttentionAction} fields={{ eventId: item.id }} Icon={CircleAlert} detail={item.referralName ?? copy.checkResult} key={item.id} priority={item.priority} status={copy.open} title={agentEventCopy[locale][item.eventCode] ?? copy.checkResult}/>)}</div></section> : null}

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
      <section className="space-y-3" aria-labelledby="active-referrals-heading">
        <SectionHeader
          action={<Link className={cabinetTextAction} href="/agent/referrals">{copy.allReferrals}<ArrowRight aria-hidden className="size-4" /></Link>}
          detail={`${overview.kpis.activeReferrals + overview.kpis.newReferrals} ${locale === "ro" ? "în lucru" : "в работе"}`}
          title={copy.activeReferrals}
        />
        {overview.latestReferrals.length ? <div className={cabinetList}>{overview.latestReferrals.map((item)=><Link className={`group grid min-h-[72px] gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${cabinetRow}`} href={`/agent/referrals/${item.id}`} key={item.id}><span className="min-w-0"><strong className="block truncate text-sm">{item.name}</strong><span className="mt-1 flex items-center gap-1 text-xs text-zinc-500"><Clock3 aria-hidden className="size-3.5" />{formatDate(item.updatedAt ?? item.submittedAt, locale)}</span></span><span className="flex items-center justify-between gap-3"><ReferralStatusBadge locale={locale} status={item.status}/><ArrowRight aria-hidden className="size-4 text-zinc-400 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" /></span></Link>)}</div>:<p className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600">{copy.noReferrals}</p>}
      </section>

      <aside className="space-y-3" aria-labelledby="share-heading">
        <SectionHeader title={copy.share}/>
        <div className={`p-4 ${cabinetSurface}`}><QrCode aria-hidden className="size-6 text-emerald-700"/><p className="mt-3 text-sm leading-5 text-zinc-600">{copy.shareBody}</p><div className="mt-4 grid gap-2"><Link className={cabinetPrimaryAction} href="/agent/qr"><QrCode aria-hidden className="size-4" />{copy.showQr}</Link><Link className={cabinetSecondaryAction} href="/agent/materials"><BookOpen aria-hidden className="size-4" />{copy.materials}</Link></div></div>
      </aside>
    </div>

    <section className="space-y-3" aria-labelledby="activity-heading">
      <SectionHeader title={copy.recentActivity}/>
      {overview.latestActivity.length ? <ol className="divide-y divide-zinc-100 border-y border-zinc-200">{overview.latestActivity.map((item)=><li key={item.id}>{item.referralId ? <Link className="flex min-h-14 items-center gap-3 rounded-sm py-3 outline-none transition-colors hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-emerald-700 motion-reduce:transition-none" href={`/agent/referrals/${item.referralId}`}><ActivityContent item={item} locale={locale}/><ArrowRight aria-hidden className="size-4 shrink-0 text-zinc-400" /></Link> : <div className="flex min-h-14 items-center gap-3 py-3"><ActivityContent item={item} locale={locale}/></div>}</li>)}</ol>:<p className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500">{copy.noActivity}</p>}
    </section>
  </main>;
}

function ActivityContent({ item, locale }: { item: { eventType: string; referralName: string | null; createdAt: string }; locale: "ru" | "ro" }) {
  return <><span aria-hidden className="size-2 shrink-0 rounded-full bg-emerald-600"/><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{agentEventCopy[locale][item.eventType] ?? (locale === "ro" ? "Actualizare" : "Обновление")}</span>{item.referralName ? <span className="block truncate text-xs text-zinc-500">{item.referralName}</span> : null}</span><time className="shrink-0 text-xs text-zinc-500" dateTime={item.createdAt}>{formatDate(item.createdAt, locale)}</time></>;
}

function formatDate(value: string, locale: "ru" | "ro") {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { day: "2-digit", month: "short" }).format(new Date(value));
}

function formatMoney(value: number, currency: string, locale: "ru" | "ro") {
  return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { style: "currency", currency }).format(value);
}
