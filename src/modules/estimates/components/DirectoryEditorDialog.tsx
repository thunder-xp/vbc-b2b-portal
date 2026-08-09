"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

export function DirectoryEditorDialog({ children, description, onClose, title }: {
  children: React.ReactNode;
  description?: string;
  onClose: () => void;
  title: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  return <div
    aria-describedby={description ? "directory-dialog-description" : undefined}
    aria-labelledby="directory-dialog-title"
    aria-modal="true"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    role="dialog"
  >
    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-md bg-white shadow-xl" ref={panelRef}>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-200 bg-white px-5 py-4">
        <div className="min-w-0"><h2 className="text-lg font-semibold text-zinc-950" id="directory-dialog-title">{title}</h2>{description ? <p className="mt-1 text-sm text-zinc-500" id="directory-dialog-description">{description}</p> : null}</div>
        <button aria-label="Закрыть" className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500" onClick={onClose} type="button"><X className="size-5" /></button>
      </header>
      {children}
    </div>
  </div>;
}
