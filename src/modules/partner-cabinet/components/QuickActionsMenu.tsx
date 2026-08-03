"use client";

import { ChevronDown, FileSearch, FilePlus2, History, ListRestart, ShoppingCart, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { WorkspaceQuickActionDto } from "../services";

const icons = {
  cart: ShoppingCart,
  repeat_order: History,
  estimate: FilePlus2,
  register_warranty: Wrench,
  purchase_templates: ListRestart,
  documents: FileSearch,
} as const;

export function QuickActionsMenu({ actions }: { actions: WorkspaceQuickActionDto[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  if (!actions.length) return null;
  return (
    <div className="relative" ref={rootRef}>
      <button aria-controls="partner-quick-actions" aria-expanded={open} aria-haspopup="menu" aria-label="Быстрые действия" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={() => setOpen((value) => !value)} ref={triggerRef} title="Быстрые действия" type="button">
        <span className="hidden xl:inline">Быстрые действия</span>
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>
      {open ? <nav aria-label="Быстрые действия" className="fixed inset-x-3 top-28 z-50 rounded-md border border-zinc-200 bg-white p-1.5 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-72" id="partner-quick-actions" role="menu">
        {actions.map((action) => {
          const Icon = icons[action.key as keyof typeof icons] ?? FileSearch;
          return <Link className="flex min-h-11 items-center gap-3 rounded px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={action.href} key={action.key} onClick={() => setOpen(false)} prefetch={false} role="menuitem"><Icon aria-hidden="true" className="size-4" />{action.label}</Link>;
        })}
      </nav> : null}
    </div>
  );
}
