import type { ReactNode } from "react";

export function OperationalStatusPair({ primaryLabel, primaryValue, secondaryLabel, secondaryValue }: { primaryLabel: string; primaryValue: ReactNode; secondaryLabel: string; secondaryValue: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-4 text-sm"><div className="min-w-0"><dt className="text-xs leading-4 text-zinc-500">{primaryLabel}</dt><dd className="mt-1 font-medium text-zinc-900">{primaryValue}</dd></div><div className="min-w-0"><dt className="text-xs leading-4 text-zinc-500">{secondaryLabel}</dt><dd className="mt-1 font-medium text-zinc-900">{secondaryValue}</dd></div></dl>;
}

export function OperationalTimeline({ items }: { items: ReadonlyArray<{ id: string; label: string; date: string }> }) {
  return <ol className="border-l border-zinc-200 pl-5">{items.map((item) => <li className="relative pb-4 last:pb-0" key={item.id}><span className="absolute -left-[25px] top-1 size-2 rounded-full border-2 border-white bg-emerald-700 ring-1 ring-emerald-700" /><p className="text-sm font-medium leading-5 text-zinc-900">{item.label}</p><p className="mt-0.5 text-xs text-zinc-500">{item.date}</p></li>)}</ol>;
}
