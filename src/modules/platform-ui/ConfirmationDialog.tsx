"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { actionClassName } from "./action-styles";

export function ConfirmationDialog({ open, title, consequence, confirmLabel, pending = false, destructive = false, onCancel, onConfirm, children }: {
  open: boolean;
  title: string;
  consequence: string;
  confirmLabel: string;
  pending?: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("button, input, select, textarea, a[href]")?.focus();
    return () => previousFocus.current?.focus();
  }, [open]);
  if (!open) return null;

  return <div aria-labelledby="platform-confirmation-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={(event) => { if (event.target === event.currentTarget && !pending) onCancel(); }} onKeyDown={(event) => {
    if (event.key === "Escape" && !pending) onCancel();
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]"));
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }} role="dialog">
    <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl" ref={dialogRef}>
      <header className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold" id="platform-confirmation-title">{title}</h2><p className="mt-1 text-sm text-zinc-600">{consequence}</p></div><button aria-label="Закрыть" className="grid size-11 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100" disabled={pending} onClick={onCancel} type="button"><X className="size-5" /></button></header>
      {children ? <div className="mt-4">{children}</div> : null}
      <footer className="mt-5 flex flex-wrap justify-end gap-2"><button className={actionClassName.secondary} disabled={pending} onClick={onCancel} type="button">Отмена</button><button className={actionClassName[destructive ? "destructive" : "primary"]} disabled={pending} onClick={onConfirm} type="button">{confirmLabel}</button></footer>
    </div>
  </div>;
}
