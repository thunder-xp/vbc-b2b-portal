import type { ReactNode } from "react";

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{eyebrow}</p> : null}
        <h1 className={`${eyebrow ? "mt-1" : ""} text-2xl font-semibold leading-tight tracking-tight text-zinc-950`}>{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-5 text-zinc-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2 max-sm:[&>*]:flex-1">{actions}</div> : null}
    </header>
  );
}

export const cabinetPageWide = "mx-auto max-w-6xl space-y-6 px-4 py-5 sm:py-7";
export const cabinetPage = "mx-auto max-w-5xl space-y-6 px-4 py-5 sm:py-7";
export const cabinetPageNarrow = "mx-auto max-w-4xl space-y-6 px-4 py-5 sm:py-7";
export const cabinetSurface = "rounded-xl border border-zinc-200 bg-white";
export const cabinetList = `${cabinetSurface} divide-y divide-zinc-100 overflow-hidden`;
export const cabinetRow = "transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 motion-reduce:transition-none";
export const cabinetPrimaryAction = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 active:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400 motion-reduce:transition-none";
export const cabinetSecondaryAction = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition-colors hover:border-zinc-500 hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:text-zinc-400 motion-reduce:transition-none";
export const cabinetTextAction = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800 active:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 motion-reduce:transition-none";
export const cabinetField = "min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition-shadow placeholder:text-zinc-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-zinc-100 motion-reduce:transition-none";
