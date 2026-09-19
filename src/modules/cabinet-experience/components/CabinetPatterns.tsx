import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";

export function SectionHeader({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="flex items-end justify-between gap-4"><div><h2 className="text-lg font-semibold tracking-tight">{title}</h2>{detail ? <p className="mt-0.5 text-sm text-zinc-500">{detail}</p> : null}</div>{action}</div>;
}

export function AttentionItem({ href, title, detail, status, Icon }: { href: string; title: string; detail: string; status?: string; Icon: LucideIcon }) {
  return <Link className="group flex min-h-16 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 hover:border-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" href={href}><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-amber-800"><Icon aria-hidden className="size-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-zinc-950">{title}</span><span className="block text-sm text-zinc-600">{detail}</span></span>{status ? <span className="hidden text-xs font-semibold text-amber-900 sm:block">{status}</span> : null}</Link>;
}

export function CabinetEmptyState({ Icon, title, body, actions }: { Icon: LucideIcon; title: string; body: string; actions: ReactNode }) {
  return <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-6 sm:px-7"><span className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Icon aria-hidden className="size-5" /></span><h2 className="mt-4 text-xl font-semibold tracking-tight">{title}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-zinc-600">{body}</p><div className="mt-5 flex flex-col gap-2 sm:flex-row">{actions}</div></section>;
}
