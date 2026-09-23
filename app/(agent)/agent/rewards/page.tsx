import Link from "next/link";
import { agentCabinetCopy, createAgentCabinetService, getAgentCabinetLocale } from "@/src/modules/agent-cabinet";
import { WorkspaceHeader, cabinetPageWide, cabinetSurface } from "@/src/modules/cabinet-experience/components";

export default async function AgentRewardsPage() {
  const [view, locale] = await Promise.all([createAgentCabinetService().rewards(), getAgentCabinetLocale()]);
  const copy = agentCabinetCopy[locale];
  const totals = [[copy.expected, view.totals.expected], [copy.review, view.totals.review], [copy.available, view.totals.available], [copy.paid, view.totals.paid]] as const;
  return <main className={cabinetPageWide}>
    <WorkspaceHeader eyebrow={copy.cabinet} title={copy.rewardsTitle}/>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{totals.map(([label, value]) => <div className={`p-4 ${cabinetSurface}`} key={label}><p className="text-xs font-semibold uppercase text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{money(value, "MDL", locale)}</p></div>)}</section>
    <section><h2 className="mb-3 text-lg font-semibold">{copy.monthlyStatement}</h2>{view.items.length ? <div className="space-y-4">{groupByMonth(view.items, locale).map((group) => <div className={cabinetSurface} key={group.key}><h3 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold capitalize">{group.label}</h3><div className="divide-y divide-zinc-100">{group.items.map((item) => <Link className="flex min-h-16 items-center justify-between gap-4 p-4 hover:bg-zinc-50" href={`/agent/deals/${item.saleLinkId}`} key={item.saleLinkId}><span><strong className="block">{item.orderNumber}</strong><span className="text-xs text-zinc-500">{new Date(item.orderDate).toLocaleDateString(locale === "ro" ? "ro-MD" : "ru-MD")} · {item.state}</span></span><strong className="tabular-nums">{money(item.amount, item.currency, locale)}</strong></Link>)}</div></div>)}</div> : <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600">{copy.noRewards}</p>}</section>
  </main>;
}
function money(value: number, currency: string, locale: "ru" | "ro") { return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { style: "currency", currency }).format(value); }
function groupByMonth<T extends { orderDate: string }>(items: T[], locale: "ru" | "ro") {
  const groups = new Map<string, T[]>();
  for (const item of items) { const date = new Date(item.orderDate); const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; groups.set(key, [...(groups.get(key) ?? []), item]); }
  return [...groups].map(([key, grouped]) => ({ key, label: new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { month: "long", year: "numeric" }).format(new Date(`${key}-01T00:00:00Z`)), items: grouped }));
}
