import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

export function CatalogFilterPanel({ children, clearAction, compact = false, selectedCount, selectedLabel = "Выбрано", title }: { children: ReactNode; clearAction?: ReactNode; compact?: boolean; selectedCount: number; selectedLabel?: string; title: string }) {
  return <div className={compact ? "space-y-4" : "space-y-5"}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="size-4 text-zinc-500" /><div><h2 className={compact ? "text-xs font-semibold leading-[1.35] text-zinc-950" : "font-semibold text-zinc-950"}>{title}</h2><p className={compact ? "mt-1 text-[10px] font-medium leading-[1.35] text-zinc-500 tabular-nums" : "mt-1 text-xs text-zinc-500"}>{selectedLabel}: {selectedCount}</p></div></div>
      {selectedCount > 0 ? clearAction : null}
    </div>
    {children}
  </div>;
}

export function CatalogFilterGroup({ children, compact = false, defaultOpen = false, title }: { children: ReactNode; compact?: boolean; defaultOpen?: boolean; title: string }) {
  return <details className={`group border-t border-zinc-100 first:border-t-0 first:pt-0 ${compact ? "pt-3" : "pt-4"}`} open={defaultOpen || undefined}>
    <summary className={compact ? "flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold leading-[1.35] text-zinc-900" : "flex min-h-9 cursor-pointer list-none items-center justify-between text-sm font-semibold text-zinc-900"}>{title}<ChevronDown aria-hidden="true" className={`size-4 text-zinc-400 transition-transform group-open:rotate-180 ${compact ? "shrink-0" : ""}`} /></summary>
    <div className="mt-2 max-h-64 space-y-1 overflow-auto">{children}</div>
  </details>;
}

export function catalogFilterOptionClassName(selected: boolean, compact: boolean): string {
  if (!compact) return "flex items-center rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50";
  return `flex min-h-8 items-center rounded-md px-2 py-1 text-[11px] leading-[1.35] transition-colors hover:bg-zinc-50 ${
    selected ? "font-semibold text-zinc-950" : "font-medium text-zinc-700"
  }`;
}
