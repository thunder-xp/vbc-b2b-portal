import type { ReactNode } from "react";

export const CATALOG_PRODUCT_GRID_CLASS =
  "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5";

export function CatalogProductGridFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${CATALOG_PRODUCT_GRID_CLASS} ${className}`.trim()}>{children}</div>;
}

export function CatalogToolbarFrame({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">{children}</div>;
}

export function CatalogResultsHeader({ action, countLabel, eyebrow, eyebrowTone = "default", title }: { action?: ReactNode; countLabel?: string; eyebrow?: string; eyebrowTone?: "default" | "retail"; title: string }) {
  return <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
    <div>{eyebrow ? <p className={`text-xs font-semibold uppercase ${eyebrowTone === "retail" ? "text-blue-700" : "text-emerald-700"}`}>{eyebrow}</p> : null}<h1 className={eyebrow ? "mt-2 text-3xl font-semibold tracking-tight" : "text-2xl font-semibold text-zinc-950"}>{title}</h1>{countLabel ? <p className="mt-1 text-sm text-zinc-500">{countLabel}</p> : null}</div>
    {action}
  </header>;
}
