import Link from "next/link";
import { supportCopy, supportStatusLabel, type PartnerLocale } from "../partner-locale";
import type { SupportDashboardItem } from "./types";

export function SupportDashboardBlock({ items, locale = "ru" }: { items: SupportDashboardItem[]; locale?: PartnerLocale }) {
  if (!items.length) return null;
  const copy = supportCopy(locale);
  return <section aria-labelledby="dashboard-support"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold" id="dashboard-support">{copy.title}</h2><Link className="text-sm font-semibold text-emerald-700" href="/cabinet/support">{copy.allTickets}</Link></div><ul className="mt-3 divide-y divide-zinc-200 border border-zinc-200 bg-white">{items.slice(0, 2).map((item) => <li className="grid gap-2 p-4 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-center" key={item.id}><div><p className="font-semibold">{item.ticketNumber}</p><p className="text-xs text-zinc-500">{supportStatusLabel(locale, item.status)}</p></div><p className="text-sm text-zinc-700">{item.nextAction}</p><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href={item.href}>{copy.openTicket}</Link></li>)}</ul></section>;
}
