"use client";

import { Bell, Building2, ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { signOutAction } from "@/src/modules/auth/actions/auth.actions";
import type { PartnerWorkspaceShellContext } from "./PartnerLayout";

export function UserMenu({ context }: { context: PartnerWorkspaceShellContext }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const displayName = context.userDisplayName || context.userEmail;
  const initial = (displayName || "P").slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls="partner-user-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Открыть меню пользователя"
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 bg-white p-1.5 pr-2 text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded bg-emerald-100 bg-contain bg-center bg-no-repeat text-sm font-semibold text-emerald-800"
          style={context.companyLogoUrl ? { backgroundImage: `url("${context.companyLogoUrl}")` } : undefined}
        >
          {context.companyLogoUrl ? null : initial}
        </span>
        <span className="hidden max-w-36 truncate text-sm font-medium lg:block">{displayName}</span>
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>

      {open ? (
        <div
          aria-label="Меню пользователя"
          className="fixed inset-x-3 top-28 z-50 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-72"
          id="partner-user-menu"
          role="menu"
        >
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="truncate text-sm font-semibold text-zinc-950">{displayName}</p>
            <p className="mt-1 truncate text-xs text-zinc-500">{context.membershipRole ?? "Партнёр"}</p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">{context.companyName ?? "Компания не выбрана"}</p>
          </div>
          <nav aria-label="Настройки пользователя" className="p-1.5">
            <MenuLink href="/cabinet/company" icon={Building2} label="Моя компания" onSelect={() => setOpen(false)} />
            <MenuLink href="/cabinet/notifications" icon={Bell} label="Уведомления" onSelect={() => setOpen(false)} />
            <MenuLink href="/cabinet/profile" icon={UserRound} label="Профиль" onSelect={() => setOpen(false)} />
          </nav>
          <form action={signOutAction} className="border-t border-zinc-200 p-1.5">
            <button className="flex min-h-11 w-full items-center gap-3 rounded px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" role="menuitem" type="submit">
              <LogOut aria-hidden="true" className="size-4" />
              Выйти
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({ href, icon: Icon, label, onSelect }: {
  href: string;
  icon: typeof Building2;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Link className="flex min-h-11 items-center gap-3 rounded px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={href} onClick={onSelect} prefetch={false} role="menuitem">
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}
