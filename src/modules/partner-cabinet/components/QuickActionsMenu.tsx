"use client";

import { FileSearch, FilePlus2, History, ListRestart, ShoppingCart, Wrench, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { usePartnerLocale, usePartnerText, type PartnerTranslationKey } from "../../partner-locale";
import type { WorkspaceQuickActionDto } from "../services";

const icons = {
  cart: ShoppingCart,
  repeat_order: History,
  estimate: FilePlus2,
  register_warranty: Wrench,
  it_support: Wrench,
  purchase_templates: ListRestart,
  documents: FileSearch,
} as const;

const actionKeys: Partial<Record<string, PartnerTranslationKey>> = {
  cart: "quick.cart",
  documents: "quick.documents",
  estimate: "quick.estimate",
  it_support: "quick.it_support",
  purchase_templates: "quick.purchase_templates",
  register_warranty: "quick.register_warranty",
  repeat_order: "quick.repeat_order",
};

export function QuickActionsMenu({ actions }: { actions: WorkspaceQuickActionDto[] }) {
  const locale = usePartnerLocale();
  const t = usePartnerText();
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
    <div className="relative shrink-0" ref={rootRef}>
      <button aria-controls="partner-quick-actions" aria-expanded={open} aria-haspopup="menu" aria-label={t("quick.title")} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" data-header-control="quick-action" onClick={() => setOpen((value) => !value)} ref={triggerRef} title={t("quick.title")} type="button">
        <Zap aria-hidden="true" className="size-[19px]" />
      </button>
      {open ? <nav aria-label={t("quick.title")} className="fixed inset-x-3 top-[7.5rem] z-50 rounded-md border border-zinc-200 bg-white p-1.5 shadow-xl sm:left-auto sm:right-3 sm:w-72 sm:max-w-[calc(100vw-1.5rem)] lg:absolute lg:inset-x-auto lg:right-0 lg:top-[calc(100%+0.5rem)]" id="partner-quick-actions" lang={locale} role="menu">
        {actions.map((action) => {
          const Icon = icons[action.key as keyof typeof icons] ?? FileSearch;
          const translationKey = actionKeys[action.key];
          return <Link className="flex min-h-11 items-center gap-3 rounded px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={action.href} key={action.key} onClick={() => setOpen(false)} prefetch={false} role="menuitem"><Icon aria-hidden="true" className="size-4" />{translationKey ? t(translationKey) : action.label}</Link>;
        })}
      </nav> : null}
    </div>
  );
}
