import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

export function CatalogFilterPanel({ children, clearAction, selectedCount, selectedLabel = "Выбрано", title }: { children: ReactNode; clearAction?: ReactNode; selectedCount: number; selectedLabel?: string; title: string }) {
  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="size-4 text-zinc-500" /><div><h2 className="font-semibold text-zinc-950">{title}</h2><p className="mt-1 text-xs text-zinc-500">{selectedLabel}: {selectedCount}</p></div></div>
      {selectedCount > 0 ? clearAction : null}
    </div>
    {children}
  </div>;
}

export function CatalogFilterGroup({ children, defaultOpen = false, title }: { children: ReactNode; defaultOpen?: boolean; title: string }) {
  return <details className="group border-t border-zinc-100 pt-4 first:border-t-0 first:pt-0" open={defaultOpen || undefined}>
    <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-sm font-semibold text-zinc-900">{title}<ChevronDown aria-hidden="true" className="size-4 text-zinc-400 transition-transform group-open:rotate-180" /></summary>
    <div className="mt-2 max-h-64 space-y-1 overflow-auto">{children}</div>
  </details>;
}
