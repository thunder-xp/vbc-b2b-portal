"use client";

import { LayoutGrid, List } from "lucide-react";

import { CATALOG_VIEW_COOKIE, type CatalogViewMode } from "../services/catalog-view-preference";
import { getCatalogCopy, usePartnerLocale } from "../../partner-locale";

export function CatalogViewSwitcher({ mode, onChange }: { mode: CatalogViewMode; onChange: (mode: CatalogViewMode) => void }) {
  const copy = getCatalogCopy(usePartnerLocale());
  function select(nextMode: CatalogViewMode) {
    if (nextMode === mode) return;
    document.cookie = `${CATALOG_VIEW_COOKIE}=${nextMode}; Max-Age=31536000; Path=/; SameSite=Lax`;
    onChange(nextMode);
  }

  return <div aria-label={copy.catalogView} className="inline-flex rounded-md border border-zinc-300 bg-white p-0.5" role="group">
    <button aria-label={copy.cards} aria-pressed={mode === "cards"} className={`inline-flex size-9 items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${mode === "cards" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`} onClick={() => select("cards")} title={copy.cards} type="button"><LayoutGrid aria-hidden="true" className="size-4" /></button>
    <button aria-label={copy.list} aria-pressed={mode === "list"} className={`inline-flex size-9 items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${mode === "list" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`} onClick={() => select("list")} title={copy.list} type="button"><List aria-hidden="true" className="size-4" /></button>
  </div>;
}
