import { ArrowRight, BookOpen, CircleAlert, Clock3, Plus, QrCode } from "lucide-react";
import Link from "next/link";

import {
  AttentionItem,
  SectionHeader,
  WorkspaceHeader,
  cabinetPrimaryAction,
  cabinetSecondaryAction,
} from "@/src/modules/cabinet-experience/components";
import {
  agentCabinetCopy,
  agentEventCopy,
  createAgentCabinetService,
  getAgentCabinetLocale,
} from "@/src/modules/agent-cabinet";
import { ReferralStatusBadge } from "@/src/modules/agent-cabinet/components/StatusBadge";

export default async function AgentHomePage() {
  const [overview, locale] = await Promise.all([
    createAgentCabinetService().overview(),
    getAgentCabinetLocale(),
  ]);
  if (!overview) return null;
  const copy = agentCabinetCopy[locale];
  const attention = overview.needsAttention[0] ?? null;

  return <main className="mx-auto max-w-6xl space-y-7 px-4 py-6 sm:py-8">
    <WorkspaceHeader
      eyebrow={copy.today}
      title={copy.cabinet}
      actions={<><Link className={cabinetPrimaryAction} href="/agent/qr#referral-link"><Plus aria-hidden className="size-4" />{copy.primaryAction}</Link><Link className={cabinetSecondaryAction} href="/agent/qr"><QrCode aria-hidden className="size-4" />{copy.showQr}</Link></>}
    />

    {attention ? <section className="space-y-3" aria-label={copy.attention}><SectionHeader title={copy.attention}/><AttentionItem Icon={CircleAlert} detail={copy.checkResult} href={`/agent/referrals/${attention.id}`} status={copy.open} title={attention.name}/></section> : null}

    <div className="grid gap-7 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
      <section className="space-y-3" aria-labelledby="active-referrals-heading">
        <SectionHeader
          action={<Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700" href="/agent/referrals">{copy.allReferrals}<ArrowRight aria-hidden className="size-4" /></Link>}
          detail={`${overview.kpis.activeReferrals + overview.kpis.newReferrals} ${locale === "ro" ? "în lucru" : "в работе"}`}
          title={copy.activeReferrals}
        />
        {overview.latestReferrals.length ? <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">{overview.latestReferrals.map((item)=><Link className="group grid min-h-[72px] gap-2 px-4 py-3 hover:bg-zinc-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" href={`/agent/referrals/${item.id}`} key={item.id}><span className="min-w-0"><strong className="block truncate text-sm">{item.name}</strong><span className="mt-1 flex items-center gap-1 text-xs text-zinc-500"><Clock3 aria-hidden className="size-3.5" />{formatDate(item.updatedAt ?? item.submittedAt, locale)}</span></span><span className="flex items-center justify-between gap-3"><ReferralStatusBadge locale={locale} status={item.status}/><ArrowRight aria-hidden className="size-4 text-zinc-400 transition-transform group-hover:translate-x-0.5" /></span></Link>)}</div>:<p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">{copy.noReferrals}</p>}
      </section>

      <aside className="space-y-3" aria-labelledby="share-heading">
        <SectionHeader title={copy.share}/>
        <div className="rounded-xl bg-zinc-900 p-5 text-white"><QrCode aria-hidden className="size-6 text-emerald-300"/><p className="mt-4 text-sm leading-6 text-zinc-300">{copy.shareBody}</p><div className="mt-5 grid gap-2"><Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-100" href="/agent/qr"><QrCode aria-hidden className="size-4" />{copy.showQr}</Link><Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm font-semibold text-white hover:border-zinc-500" href="/agent/materials"><BookOpen aria-hidden className="size-4" />{copy.materials}</Link></div></div>
      </aside>
    </div>

    <section className="space-y-3" aria-labelledby="activity-heading">
      <SectionHeader title={copy.recentActivity}/>
      {overview.latestActivity.length ? <ol className="divide-y divide-zinc-100 border-y border-zinc-200">{overview.latestActivity.map((item)=><li key={item.id}>{item.referralId ? <Link className="flex min-h-14 items-center gap-3 py-3 outline-none hover:text-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600" href={`/agent/referrals/${item.referralId}`}><ActivityContent item={item} locale={locale}/><ArrowRight aria-hidden className="size-4 shrink-0 text-zinc-400" /></Link> : <div className="flex min-h-14 items-center gap-3 py-3"><ActivityContent item={item} locale={locale}/></div>}</li>)}</ol>:<p className="text-sm text-zinc-500">{copy.noActivity}</p>}
    </section>
  </main>;
}

function ActivityContent({ item, locale }: { item: { eventType: string; referralName: string | null; createdAt: string }; locale: "ru" | "ro" }) {
  return <><span aria-hidden className="size-2 shrink-0 rounded-full bg-emerald-600"/><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{agentEventCopy[locale][item.eventType] ?? (locale === "ro" ? "Actualizare" : "Обновление")}</span>{item.referralName ? <span className="block truncate text-xs text-zinc-500">{item.referralName}</span> : null}</span><time className="shrink-0 text-xs text-zinc-500" dateTime={item.createdAt}>{formatDate(item.createdAt, locale)}</time></>;
}

function formatDate(value: string, locale: "ru" | "ro") {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { day: "2-digit", month: "short" }).format(new Date(value));
}
