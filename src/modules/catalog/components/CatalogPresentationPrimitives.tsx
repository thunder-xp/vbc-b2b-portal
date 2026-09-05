import type { ReactNode } from "react";

export const CATALOG_PRODUCT_GRID_CLASS =
  "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5";

export const PUBLIC_RETAIL_PRODUCT_GRID_CLASS =
  "public-retail-product-grid grid min-w-0 gap-3";

export function CatalogProductGridFrame({ children, className = "", layout = "default" }: { children: ReactNode; className?: string; layout?: "default" | "public-retail" }) {
  const gridClassName = layout === "public-retail" ? PUBLIC_RETAIL_PRODUCT_GRID_CLASS : CATALOG_PRODUCT_GRID_CLASS;
  return <div className={`${gridClassName} ${className}`.trim()} data-product-grid={layout}>{children}</div>;
}

export function CatalogToolbarFrame({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(16rem,1fr)_auto_auto] xl:items-center">{children}</div>;
}

export function CatalogResultsHeader({ action, countLabel, eyebrow, eyebrowTone = "default", title }: { action?: ReactNode; countLabel?: string; eyebrow?: string; eyebrowTone?: "default" | "retail"; title: string }) {
  return <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
    <div>{eyebrow ? <p className={`text-xs font-semibold uppercase ${eyebrowTone === "retail" ? "text-blue-700" : "text-emerald-700"}`}>{eyebrow}</p> : null}<h1 className={eyebrow ? "mt-2 text-3xl font-semibold tracking-tight" : "text-2xl font-semibold text-zinc-950"}>{title}</h1>{countLabel ? <p className="mt-1 text-sm text-zinc-500">{countLabel}</p> : null}</div>
    {action}
  </header>;
}
