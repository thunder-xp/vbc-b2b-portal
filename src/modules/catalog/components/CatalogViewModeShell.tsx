"use client";

import { useState, type ReactNode } from "react";

import type { CatalogViewMode } from "../services";
import { CatalogViewSwitcher } from "./CatalogViewSwitcher";

export function CatalogViewModeShell({ cards, initialMode, list, quickLinks }: { cards: ReactNode; initialMode: CatalogViewMode; list: ReactNode; quickLinks?: ReactNode }) {
  const [mode, setMode] = useState(initialMode);

  return <div className="space-y-3">
    <div className="flex min-w-0 items-center gap-2" data-testid="catalog-results-toolbar">
      <div className="min-w-0 flex-1">{quickLinks}</div>
      <div className="shrink-0"><CatalogViewSwitcher mode={mode} onChange={setMode} /></div>
    </div>
    {mode === "list" ? list : cards}
  </div>;
}
