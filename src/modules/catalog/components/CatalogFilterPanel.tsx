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
  return <details className="catalog-filter-group" open={defaultOpen || undefined}>
    <summary className="catalog-filter-group-summary">{title}<ChevronDown aria-hidden="true" className="catalog-filter-group-chevron" /></summary>
    <div className="catalog-filter-group-options">{children}</div>
  </details>;
}
