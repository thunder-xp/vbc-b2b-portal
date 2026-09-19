import { AlertCircle, CheckCircle2, Clock3, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";

export function SectionHeader({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="flex min-h-11 items-center justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-semibold leading-tight tracking-tight text-zinc-950">{title}</h2>{detail ? <p className="mt-0.5 text-sm leading-5 text-zinc-500">{detail}</p> : null}</div>{action ? <div className="shrink-0">{action}</div> : null}</div>;
}

export function AttentionItem({ href, title, detail, status, Icon }: { href: string; title: string; detail: string; status?: string; Icon: LucideIcon }) {
  return <Link className="group flex min-h-16 items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3.5 py-3 transition-colors hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 motion-reduce:transition-none" href={href}><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-amber-800"><Icon aria-hidden className="size-4.5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-zinc-950">{title}</span><span className="block text-sm leading-5 text-zinc-600">{detail}</span></span>{status ? <span className="hidden text-xs font-semibold text-amber-900 sm:block">{status}</span> : null}</Link>;
}

export function AttentionActionItem({ action, fields, title, detail, status, Icon, priority = "IMPORTANT_UPDATE" }: { action: (formData: FormData) => void | Promise<void>; fields: Readonly<Record<string, string>>; title: string; detail: string; status: string; Icon: LucideIcon; priority?: "ACTION_REQUIRED" | "IMPORTANT_UPDATE" | "INFORMATIONAL" }) {
  const tone = priority === "ACTION_REQUIRED"
    ? "border-amber-200 bg-amber-50/80 hover:border-amber-300 hover:bg-amber-50"
    : priority === "IMPORTANT_UPDATE"
      ? "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300 hover:bg-emerald-50"
      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50";
  const iconTone = priority === "ACTION_REQUIRED" ? "text-amber-800" : priority === "IMPORTANT_UPDATE" ? "text-emerald-800" : "text-zinc-600";
  const statusTone = priority === "ACTION_REQUIRED" ? "text-amber-900" : priority === "IMPORTANT_UPDATE" ? "text-emerald-900" : "text-zinc-600";
  return <form action={action}>{Object.entries(fields).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}<button className={`group flex min-h-16 w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 motion-reduce:transition-none ${tone}`} type="submit"><span className={`flex size-9 shrink-0 items-center justify-center rounded-lg bg-white ${iconTone}`}><Icon aria-hidden className="size-4.5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-zinc-950">{title}</span><span className="block text-sm leading-5 text-zinc-600">{detail}</span></span><span className={`hidden text-xs font-semibold sm:block ${statusTone}`}>{status}</span></button></form>;
}

export function CabinetEmptyState({ Icon, title, body, actions }: { Icon: LucideIcon; title: string; body: string; actions: ReactNode }) {
  return <section className="rounded-xl border border-dashed border-zinc-300 bg-white px-5 py-5 sm:flex sm:items-center sm:gap-4 sm:px-6"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Icon aria-hidden className="size-5" /></span><div className="mt-3 min-w-0 flex-1 sm:mt-0"><h2 className="text-lg font-semibold tracking-tight text-zinc-950">{title}</h2><p className="mt-1 max-w-xl text-sm leading-5 text-zinc-600">{body}</p></div><div className="mt-4 flex shrink-0 flex-col gap-2 sm:mt-0 sm:flex-row">{actions}</div></section>;
}

export type CabinetStatusTone = "success" | "attention" | "danger" | "information" | "neutral" | "pending";

const statusToneClass: Record<CabinetStatusTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  attention: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-800",
  information: "border-sky-200 bg-sky-50 text-sky-800",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
  pending: "border-violet-200 bg-violet-50 text-violet-800",
};

const statusIcon: Record<CabinetStatusTone, LucideIcon> = {
  success: CheckCircle2,
  attention: AlertCircle,
  danger: AlertCircle,
  information: Info,
  neutral: Info,
  pending: Clock3,
};

export function CabinetStatusBadge({ label, tone = "neutral" }: { label: string; tone?: CabinetStatusTone }) {
  const Icon = statusIcon[tone];
  return <span className={`inline-flex min-h-7 w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-4 ${statusToneClass[tone]}`}><Icon aria-hidden className="size-3.5 shrink-0" /><span>{label}</span></span>;
}

export function CabinetFeedback({ children, tone }: { children: ReactNode; tone: "saved" | "error" | "conflict" }) {
  const styles = tone === "saved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "conflict" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800";
  return <p aria-live="polite" className={`rounded-lg border px-3 py-2 text-sm ${styles}`} role={tone === "error" ? "alert" : "status"}>{children}</p>;
}
