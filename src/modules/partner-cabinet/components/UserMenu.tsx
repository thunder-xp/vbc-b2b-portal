"use client";

import { Bell, Building2, ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { signOutAction } from "@/src/modules/auth/actions/auth.actions";
import type { PartnerWorkspaceShellContext } from "./PartnerLayout";
import { usePartnerText } from "../../partner-locale";

export function UserMenu({ context }: { context: PartnerWorkspaceShellContext }) {
  const t = usePartnerText();
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
    <div className="relative shrink-0" ref={rootRef}>
      <button
        aria-controls="partner-user-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("shell.openUserMenu")}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-zinc-300 bg-white p-1.5 pr-2 text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
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
          aria-label={t("shell.userMenu")}
          className="fixed inset-x-3 top-[7.5rem] z-50 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-xl sm:left-auto sm:right-3 sm:w-72 sm:max-w-[calc(100vw-1.5rem)] lg:absolute lg:inset-x-auto lg:right-0 lg:top-[calc(100%+0.5rem)]"
          id="partner-user-menu"
          role="menu"
        >
          <div className="flex min-w-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-950">{displayName}</p>
              <p className="mt-1 truncate text-xs text-zinc-500">{context.membershipRole ?? t("shell.partner")}</p>
              {context.partnerStatus ? <p className="mt-1 truncate text-xs font-semibold text-emerald-700">{context.partnerStatus}</p> : null}
            </div>
            <span aria-label={context.companyName ?? t("common.company")} className="flex h-12 w-16 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 bg-contain bg-center bg-no-repeat text-xs font-semibold text-zinc-600" role="img" style={context.companyLogoUrl ? { backgroundImage: `url("${context.companyLogoUrl}")` } : undefined}>
              {context.companyLogoUrl ? null : companyInitials(context.companyName)}
            </span>
          </div>
          <nav aria-label={t("shell.userSettings")} className="p-1.5">
            <MenuLink href="/cabinet/company" icon={Building2} label={t("shell.myCompany")} onSelect={() => setOpen(false)} />
            <MenuLink href="/cabinet/notifications" icon={Bell} label={t("shell.notifications")} onSelect={() => setOpen(false)} />
            <MenuLink href="/cabinet/profile" icon={UserRound} label={t("shell.profile")} onSelect={() => setOpen(false)} />
          </nav>
          <form action={signOutAction} className="border-t border-zinc-200 p-1.5">
            <button className="flex min-h-11 w-full items-center gap-3 rounded px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" role="menuitem" type="submit">
              <LogOut aria-hidden="true" className="size-4" />
              {t("shell.signOut")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function companyInitials(companyName: string | null): string {
  const parts = (companyName ?? "Компания").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "К";
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
