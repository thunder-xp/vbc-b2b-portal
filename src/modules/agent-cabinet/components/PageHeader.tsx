import type { ReactNode } from "react";

export function AgentPageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>{description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}</div>{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}</header>;
}

export const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
export const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
