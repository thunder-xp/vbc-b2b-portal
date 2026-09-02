"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const closeEvent = (panelId: string) => `catalog-filter-close:${panelId}`;

export function CatalogFilterToggle({ closeLabel, panelId, selectedCount, square, triggerLabel }: {
  closeLabel: string;
  panelId: string;
  selectedCount: number;
  square: boolean;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.dataset.open = open ? "true" : "false";
    if (open) {
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("role", "dialog");
      panel.querySelector<HTMLElement>("button, a, input, select, summary, [tabindex]:not([tabindex='-1'])")?.focus();
    } else {
      panel.removeAttribute("aria-modal");
      panel.removeAttribute("role");
    }

    const close = () => setOpen(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!open || event.key !== "Tab") return;
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
    const handleClick = (event: MouseEvent) => {
      if ((event.target as Element).closest("a")) setOpen(false);
    };
    window.addEventListener(closeEvent(panelId), close);
    document.addEventListener("keydown", handleKeyDown);
    panel.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener(closeEvent(panelId), close);
      document.removeEventListener("keydown", handleKeyDown);
      panel.removeEventListener("click", handleClick);
    };
  }, [open, panelId]);

  return <>
    <button aria-controls={panelId} aria-expanded={open} className={`inline-flex h-10 items-center gap-2 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 lg:hidden ${square ? "" : "rounded-md"}`} onClick={() => setOpen(true)} ref={triggerRef} type="button">
      <SlidersHorizontal aria-hidden="true" className="size-4" />
      {triggerLabel}{selectedCount ? ` (${selectedCount})` : ""}
    </button>
    {open ? <button aria-label={closeLabel} className="fixed inset-0 z-40 bg-zinc-950/30 lg:hidden" onClick={() => setOpen(false)} type="button" /> : null}
  </>;
}

export function CatalogFilterCloseButton({ closeLabel, panelId, square }: { closeLabel: string; panelId: string; square: boolean }) {
  return <button aria-label={closeLabel} className={`${square ? "" : "rounded"} p-2 text-zinc-600 hover:bg-zinc-100`} onClick={() => window.dispatchEvent(new Event(closeEvent(panelId)))} type="button"><X aria-hidden="true" className="size-5" /></button>;
}
