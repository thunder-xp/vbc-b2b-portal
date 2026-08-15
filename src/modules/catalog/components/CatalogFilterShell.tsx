"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CatalogFilterShell({
  children,
  closeLabel = "Закрыть фильтры",
  panelLabel = "Фильтры каталога",
  selectedCount,
  triggerLabel = "Фильтры",
}: {
  children: React.ReactNode;
  closeLabel?: string;
  panelLabel?: string;
  selectedCount: number;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>("button, a, input, select, summary, [tabindex]:not([tabindex='-1'])");
    focusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>("button, a, input, select, summary, [tabindex]:not([tabindex='-1'])")]
        .filter((item) => !item.hasAttribute("disabled"));
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return <>
    <button
      aria-expanded={open}
      className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 lg:hidden"
      onClick={() => setOpen(true)}
      ref={triggerRef}
      type="button"
    >
      <SlidersHorizontal aria-hidden="true" className="size-4" />
      {triggerLabel}{selectedCount ? ` (${selectedCount})` : ""}
    </button>
    {open ? <button aria-label={closeLabel} className="fixed inset-0 z-40 bg-zinc-950/30 lg:hidden" onClick={() => setOpen(false)} type="button" /> : null}
    <aside
      aria-label={panelLabel}
      aria-modal={open || undefined}
      className={`${open ? "fixed inset-y-0 right-0 z-50 block w-[min(22rem,calc(100vw-2rem))] overflow-y-auto shadow-2xl" : "hidden"} rounded-l-lg border border-zinc-200 bg-white p-4 lg:static lg:block lg:w-auto lg:rounded-lg lg:shadow-sm`}
      ref={panelRef}
      role={open ? "dialog" : undefined}
    >
      <div className="mb-3 flex justify-end lg:hidden">
        <button aria-label={closeLabel} className="rounded p-2 text-zinc-600 hover:bg-zinc-100" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} type="button"><X aria-hidden="true" className="size-5" /></button>
      </div>
      {children}
    </aside>
  </>;
}
